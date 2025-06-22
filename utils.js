export const buildNewItem = (body, generateId = false) => {
    const now = new Date().toISOString();

    const safeNumber = (value, defaultValue = 0) => {
        const num = Number(value);
        return Number.isFinite(num) ? num : defaultValue;
    };

    return {
        _id: generateId ? crypto.randomUUID() : body._id,
        inventory_id: safeNumber(body.inventory_id),
        created_at: body.created_at || now,
        price: safeNumber(body.price),
        quantity: safeNumber(body.quantity),
        exchange_type: body.exchange_type,
        status: body.status,
        user: {
            user_id: safeNumber(body.user?.user_id),
            role_user: body.user?.role_user
        }
    };
};
