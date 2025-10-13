import * as service from '../models/userService.js';

// insert functions here 
// eg 
// const inviteGroupMembers = async (req, res) => {xxxx}

const getPostbyId = async (req, res) => {
    // get post_id from FE
    const { post_id } = req.body;
    // check if post_id is received 
    if (!post_id) {
        return res.status(400).json({ error: "Post ID is required" });
    }

    const { data, error: getPostError } = await service.getPostbyId(post_id);

    if (getPostError) {
        return res.status(500).json({ message: "Error getting user's post" });
    }

    return res.status(200).json({ data });
} 
//tested, works 
// returns post details { data: [{[postid, created_at, review, rating, restaurant_id, poster_email]}]}




export{
    getPostbyId,
}