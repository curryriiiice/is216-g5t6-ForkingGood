import * as service from '../models/restaurantService.js';

// insert functions here 
// eg 
// const inviteGroupMembers = async (req, res) => {xxxx}

const getRestaurantbyId = async (req, res) => {
    // get restaurant_id from FE
    const { restaurant_id } = req.body;
    // check if restaurant_id is received 
    if (!restaurant_id) {
        return res.status(400).json({ error: "Restaurant ID is required" });
    }

    const { data, error: getRestError } = await service.getRestaurantbyId(restaurant_id);

    if (getRestError) {
        return res.status(500).json({ message: "Error getting restaurant details" });
    }

    return res.status(200).json({ data });
} 




export{
    getRestaurantbyId,
    
}