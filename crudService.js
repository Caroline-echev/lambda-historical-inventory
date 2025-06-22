import { ddbDocClient } from "./dynamoClient.js";
import {
  PutCommand,
  GetCommand,
  UpdateCommand,
  DeleteCommand,
  QueryCommand,
  ScanCommand
} from "@aws-sdk/lib-dynamodb";

const TABLE_NAME = "HistoricalInventoryTable";

export const createRecord = async (item) => {
  const command = new PutCommand({
    TableName: TABLE_NAME,
    Item: item
  });
  await ddbDocClient.send(command);
};

export const getRecord = async (_id) => {
  const command = new GetCommand({
    TableName: TABLE_NAME,
    Key: { _id }
  });
  const { Item } = await ddbDocClient.send(command);
  return Item;
};

export const updateRecord = async (_id, updates) => {
  const UpdateExpression = [];
  const ExpressionAttributeValues = {};
  for (const [key, value] of Object.entries(updates)) {
    UpdateExpression.push(`${key} = :${key}`);
    ExpressionAttributeValues[`:${key}`] = value;
  }

  const command = new UpdateCommand({
    TableName: TABLE_NAME,
    Key: { _id },
    UpdateExpression: `SET ${UpdateExpression.join(", ")}`,
    ExpressionAttributeValues,
    ReturnValues: "ALL_NEW"
  });
  const { Attributes } = await ddbDocClient.send(command);
  return Attributes;
};

export const deleteRecord = async (_id) => {
  const command = new DeleteCommand({
    TableName: TABLE_NAME,
    Key: { _id }
  });
  await ddbDocClient.send(command);
};

export const getByInventoryId = async (inventory_id) => {
  const command = new QueryCommand({
    TableName: TABLE_NAME,
    IndexName: "InventoryIdIndex",
    KeyConditionExpression: "inventory_id = :id",
    ExpressionAttributeValues: {
      ":id": inventory_id
    }
  });
  const { Items } = await ddbDocClient.send(command);
  return Items;
};

