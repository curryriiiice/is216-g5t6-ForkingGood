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




export{
    reverseSearch,

}