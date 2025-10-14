import * as service from '../models/mapService.js';

// insert functions here 
// eg 
// const inviteGroupMembers = async (req, res) => {xxxx}

const cuisineFilter = async (req, res) => {
    // get user_email from FE
    const { user_email } = req.body;
    // check if user_email is received 
    if (!user_email) {
        return res.status(400).json({ error: "User email is required" });
    }

    const { data, error: getFriendsError } = await service.cuisineFilter(user_email);

    if (getFriendsError) {
        return res.status(500).json({ message: "Error getting list of cuisines" });
    }

    return res.status(200).json({ data });
} 
// tested, works


const getPostbyCuisine  = async (req, res) => {
    // get user_email of friends from FE
    const { user_email , cuisine_type} = req.body;
    // check if user_email is received 
    if (!user_email || !cuisine_type) {
        return res.status(400).json({ error: "User email and cuisine type is required" });
    }

    const { data, error: getPostError } = await service.getPostbyCuisine(user_email, cuisine_type);

    if (getPostError) {
        return res.status(500).json({ message: "Error getting posts with this cuisine" });
    }

    return res.status(200).json({ data });
} 



export{
    cuisineFilter, 
    getPostbyCuisine,
    
}