import * as service from '../models/mapService.js';

// insert functions here 
// eg 
// const inviteGroupMembers = async (req, res) => {xxxx}

const getAllCuisines = async (req, res) => {
    const { data, error: getCuisineError } = await service.getAllCuisines();

    if (getCuisineError) {
        return res.status(500).json({ message: "Error getting list of cuisines" });
    }

    return res.status(200).json({ data });
} 
// tested, works

const getAllLocations = async (req, res) => {
    const { data, error: getLocationError } = await service.getAllLocations();

    if (getLocationError) {
        return res.status(500).json({ message: "Error getting list of areas" });
    }

    return res.status(200).json({ data });
} 
// tested, works

const getFilteredPosts = async (req, res) => {
    // get user_email from FE
    const { user_email, area, cuisine_type, price_level, friends} = req.body;
    // check if everything is received 
    if (!user_email) {
        return res.status(400).json({ error: "Missing information!" });
    }

    const { data, error: getPostError } = await service.getFilteredPosts(user_email, area, cuisine_type, price_level, friends);

    if (getPostError) {
        return res.status(500).json({ message: "Error retrieving posts" });
    }

    return res.status(200).json({ data });
} 
// tested, works




export{
    getAllCuisines,
    getFilteredPosts,
    getAllLocations,
    

    
}