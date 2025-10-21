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


const getUsernamebyEmail = async (req, res) => {
    // get user_email from FE
    const { user_email } = req.body;
    // check if user_email is received 
    if (!user_email) {
        return res.status(400).json({ error: "User email is required" });
    }

    const { data, error: getUsernameError } = await service.getUsernamebyEmail(user_email);

    if (getUsernameError) {
        return res.status(500).json({ message: "Error getting username" });
    }

    return res.status(200).json({ data });
} 


const createPost = async (req, res) => {
    // get data from FE
    const { user_email, name, address, cuisine_type, rating, review, is_public } = req.body;
    const photos = req.files; // array of JSONs, each JSON contains the image metadata + raw binary info 
    
    // check if everything is received 
    if (!user_email || !name || !address || !rating) {
        return res.status(400).json({ error: "Missing information!" });
    }

    const { data, error: createPostError } = await service.createPost(user_email, name, address, cuisine_type, rating, review, is_public, photos);

    if (createPostError) {
        return res.status(500).json({ message: "Error creating post" });
    }

    return res.status(200).json({ data });
}
// tested, works 

const deletePost = async (req, res) => {
    // get data from FE
    const { post_id } = req.body;
    
    // check if everything is received 
    if (!post_id) {
        return res.status(400).json({ error: "Missing information!" });
    }

    const { data, error: deletePostError } = await service.deletePost(post_id); 

    if (deletePostError) {
        return res.status(500).json({ message: "Error deleting post" });
    }

    return res.status(200).json({ message: "Post deleted successfully!" });
}
// tested, works 

const getAllUsernames = async (req, res) => {
    const { data, error: getUsernamesError } = await service.getAllUsernames(); 

    if (getUsernamesError) {
        return res.status(500).json({ message: "Error deleting post" });
    }

    return res.status(200).json({ data });
}


export{
    getPostbyId,
    getUsernamebyEmail,
    createPost,
    deletePost, 
    getAllUsernames, 
    
}