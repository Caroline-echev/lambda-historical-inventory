import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, GetCommand, UpdateCommand, DeleteCommand, QueryCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { randomUUID } from 'crypto'; 

const client = new DynamoDBClient({});
const ddbDocClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = process.env.TABLE_NAME;
const INDEX_NAME = process.env.INDEX_NAME;

export const handler = async (event) => {
    console.log("Event received:", JSON.stringify(event, null, 2));
    
    try {
        if (event.Records && event.Records[0].eventSource === 'aws:sqs') {
            return await processSqsMessages(event.Records);
        }
        
        const { httpMethod, pathParameters, queryStringParameters, body } = event;
        
        switch (httpMethod) {
            case 'GET':
                return await handleGetRequest(pathParameters, queryStringParameters);
            case 'POST':
                return await handlePostRequest(body);
            default:
                return buildResponse(405, { message: 'Method not allowed' });
        }
    } catch (error) {
        console.error('Error:', error);
        return buildResponse(500, { error: error.message });
    }
};

async function processSqsMessages(records) {
    for (const record of records) {
        try {
            const message = JSON.parse(record.body);
            const item = buildNewItem(message.data, true);
            
            if (message.operation === 'update') {
                await updateRecord(item._id, item);
                console.log('Item updated:', item);
            } else {
                await createRecord(item);
                console.log('Item created:', item);
            }
        } catch (error) {
            console.error('Error processing SQS message:', error);
        }
    }
    return buildResponse(200, { message: 'SQS messages processed' });
}

async function handleGetRequest(pathParameters, queryStringParameters) {
    if (queryStringParameters?.inventory_id) {
        const items = await getByInventoryId(Number(queryStringParameters.inventory_id));
        return buildResponse(200, items);
    }
    
    if (pathParameters?.id) {
        const item = await getRecord(pathParameters.id);
        if (!item) {
            return buildResponse(404, { message: 'Item not found' });
        }
        return buildResponse(200, item);
    }
    
    const allItems = await getAllRecords();
    return buildResponse(200, allItems);
}

async function handlePostRequest(body) {
    const requestBody = JSON.parse(body);
    const item = buildNewItem(requestBody, true);
    await createRecord(item);
    return buildResponse(201, item);
}


function buildResponse(statusCode, body) {
    return {
        statusCode,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    };
}

function buildNewItem(body, generateId = false) {
    const now = new Date().toISOString();
    return {
        _id: generateId ? randomUUID() : body._id, 
        inventory_id: sanitizeNumber(body.inventory_id),
        created_at: body.created_at || now,
        price: sanitizeNumber(body.price),
        quantity: sanitizeNumber(body.quantity),
        exchange_type: body.exchange_type,
        status: body.status,
        user: {
            user_id: sanitizeNumber(body.user?.user_id),
            role_user: body.user?.role_user
        }
    };
}

function sanitizeNumber(value) {
    if (value === null || value === undefined) {
        return 0;
    }
    
    if (typeof value === 'string') {
        if (value === 'NaN' || value === 'null' || value === 'undefined' || value.trim() === '') {
            return 0;
        }
        if (value === 'Infinity' || value === '-Infinity') {
            return 0;
        }
    }
    
    const numValue = Number(value);
    
    if (isNaN(numValue) || !isFinite(numValue)) {
        console.warn(`Invalid number value detected: ${value}, setting to 0`);
        return 0;
    }
    
    return numValue;
}

async function createRecord(item) {
    const sanitizedItem = sanitizeItem(item);
    
    const command = new PutCommand({
        TableName: TABLE_NAME,
        Item: sanitizedItem
    });
    await ddbDocClient.send(command);
}

function sanitizeItem(item) {
    const sanitized = { ...item };
    
    if ('inventory_id' in sanitized) {
        sanitized.inventory_id = sanitizeNumber(sanitized.inventory_id);
    }
    if ('price' in sanitized) {
        sanitized.price = sanitizeNumber(sanitized.price);
    }
    if ('quantity' in sanitized) {
        sanitized.quantity = sanitizeNumber(sanitized.quantity);
    }
    
    // Sanitize user object
    if (sanitized.user && typeof sanitized.user === 'object') {
        sanitized.user = {
            ...sanitized.user,
            user_id: sanitizeNumber(sanitized.user.user_id)
        };
    }
    
    console.log('Sanitized item before saving:', JSON.stringify(sanitized, null, 2));
    return sanitized;
}

async function getRecord(id) {
    const command = new GetCommand({
        TableName: TABLE_NAME,
        Key: { _id: id }
    });
    const { Item } = await ddbDocClient.send(command);
    return Item;
}

async function updateRecord(id, updates) {
    const sanitizedUpdates = sanitizeItem(updates);
    
    const updateExpressions = [];
    const expressionAttributeValues = {};
    
    for (const [key, value] of Object.entries(sanitizedUpdates)) {
        if (key !== '_id') { // Don't update the ID
            updateExpressions.push(`${key} = :${key}`);
            expressionAttributeValues[`:${key}`] = value;
        }
    }
    
    const command = new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { _id: id },
        UpdateExpression: `SET ${updateExpressions.join(', ')}`,
        ExpressionAttributeValues: expressionAttributeValues,
        ReturnValues: 'ALL_NEW'
    });
    
    const { Attributes } = await ddbDocClient.send(command);
    return Attributes;
}

async function deleteRecord(id) {
    const command = new DeleteCommand({
        TableName: TABLE_NAME,
        Key: { _id: id }
    });
    await ddbDocClient.send(command);
}

async function getByInventoryId(inventoryId) {
    const command = new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: INDEX_NAME,
        KeyConditionExpression: 'inventory_id = :id',
        ExpressionAttributeValues: {
            ':id': sanitizeNumber(inventoryId)
        }
    });
    const { Items } = await ddbDocClient.send(command);
    return Items || [];
}

async function getAllRecords() {
    const command = new ScanCommand({
        TableName: TABLE_NAME
    });
    const { Items } = await ddbDocClient.send(command);
    return Items || [];
}