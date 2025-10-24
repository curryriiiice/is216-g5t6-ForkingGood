import * as service from '../models/searchService.js';

// insert functions here 
// eg 
// const inviteGroupMembers = async (req, res) => {xxxx}

const reverseSearch = async (req, res) => {
    const photo = req.file; // Single file upload
    
    if (!photo) {
        return res.status(400).json({ error: "Photo is required" });
    }

    const { data, error: reverseSearchError } = await service.reverseSearch(photo.buffer);

    if (reverseSearchError) {
        return res.status(500).json({ message: "Error processing image" });
    }

    return res.status(200).json({ data });
};

const randomiserSearch = async (req, res) => {
    // get user_email from FE
    const { user_email, area, cuisine_type, price_level } = req.body;
    // check if everything is received 
    if (!user_email) {
        return res.status(400).json({ error: "Missing information!" });
    }

    const { data, error: getPostError } = await service.randomiserSearch(user_email, area, cuisine_type, price_level);

    if (getPostError) {
        return res.status(500).json({ message: "Error retrieving randomised posts" });
    }

    return res.status(200).json({ data });
} 
// tested, works



export{
    reverseSearch,
    randomiserSearch,


}