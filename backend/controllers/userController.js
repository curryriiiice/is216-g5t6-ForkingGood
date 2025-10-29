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
        console.log(createPostError);
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

const getAllUsers = async (req, res) => {
    // get current_user_email from FE
    const { user_email } = req.body;
    
    // check if current_user_email is received 
    if (!user_email) {
        return res.status(400).json({ error: "Current user email is required" });
    }

    const { data, error: getAllUsersError } = await service.getAllUsers(user_email);

    if (getAllUsersError) {
        return res.status(500).json({ message: "Error getting all users" });
    }

    return res.status(200).json({ data });
};

const getLikedPosts = async (req, res) => {
    // get user_email from FE
    const { user_email } = req.body;
    
    // check if user_email is received 
    if (!user_email) {
        return res.status(400).json({ error: "User email is required" });
    }

    const { data, error: getLikedPostsError } = await service.getLikedPosts(user_email);

    if (getLikedPostsError) {
        return res.status(500).json({ message: "Error getting liked posts" });
    }

    return res.status(200).json({ data });
};


const getUserPosts = async (req, res) => {
    // get data from FE
    const { user_email, friends } = req.body;
    
    // check if everything is received 
    if (!user_email || friends === undefined) {
        return res.status(400).json({ error: "Missing information!" });
    }

    const { data, error: getUserPostsError } = await service.getUserPosts(user_email, friends);

    if (getUserPostsError) {
        return res.status(500).json({ message: "Error getting user posts" });
    }

    return res.status(200).json({ data });
};

const getPfpByEmail = async (req, res) => {
    // get user_email from FE
    const { user_email } = req.body;
    
    // check if user_email is received 
    if (!user_email) {
        return res.status(400).json({ error: "User email is required" });
    }

    const { data, error: getPfpError } = await service.getPfpByEmail(user_email);

    if (getPfpError) {
        return res.status(500).json({ message: "Error getting liked posts" });
    }

    return res.status(200).json({ data });
};

const editProfile = async (req, res) => {
    // get data from FE
    const { user_email, username, bio } = req.body;
    const profile_photo = req.file; // Single file upload
    
    // check if required fields are received 
    if (!user_email || !username) {
        return res.status(400).json({ error: "User email and username are required" });
    }

    const { data, error: editProfileError } = await service.editProfile(user_email, username, bio, profile_photo);

    if (editProfileError) {
        return res.status(500).json({ message: "Error updating profile" });
    }

    return res.status(200).json({ data });
};

const removeProfilePicture = async (req, res) => {
    // get user_email from FE
    const { user_email } = req.body;
    
    // check if user_email is received 
    if (!user_email) {
        return res.status(400).json({ error: "User email is required" });
    }

    const { data, error: removeProfilePictureError } = await service.removeProfilePicture(user_email);

    if (removeProfilePictureError) {
        return res.status(500).json({ message: "Error removing profile picture" });
    }

    return res.status(200).json({ data });
};

const getProfile = async (req, res) => {
    // get user_email from FE
    const { user_email } = req.body;
    
    // check if user_email is received 
    if (!user_email) {
        return res.status(400).json({ error: "User email is required" });
    }

    const { data, error: getProfileError } = await service.getProfile(user_email);

    if (getProfileError) {
        return res.status(500).json({ message: "Error getting profile" });
    }

    return res.status(200).json({ data });
};

const deleteUserAccount = async (req, res) => {
    // get user_email from FE
    const { user_email } = req.body;
    
    // check if user_email is received 
    if (!user_email) {
        return res.status(400).json({ error: "User email is required" });
    }

    const { data, error: deleteUserAccountError } = await service.deleteUserAccount(user_email);

    if (deleteUserAccountError) {
        return res.status(500).json({ message: "Error deleting user account" });
    }

    return res.status(200).json({ data });
};

const editPost = async (req, res) => {
    // get data from FE
    const { postid, user_email, name, address, cuisine_type, rating, review, is_public } = req.body;
    
    // check if everything is received 
    if (!postid || !user_email || !name || !address || !rating) {
        return res.status(400).json({ error: "Missing information!" });
    }

    const { data, error: editPostError } = await service.editPost(
        postid, 
        user_email, 
        name, 
        address, 
        cuisine_type, 
        rating, 
        review, 
        is_public
    );

    if (editPostError) {
        return res.status(500).json({ message: "Error editing post" });
    }

    return res.status(200).json({ data });
};

const getAllUsernames = async (req, res) => {
    const { data, error: getAllUsernamesError } = await service.getAllUsernames();

    if (getAllUsernamesError) {
        return res.status(500).json({ message: "Error getting all usernames" });
    }

    return res.status(200).json({ data });
};


export{
    getPostbyId,
    getUsernamebyEmail,
    createPost,
    deletePost, 
    getAllUsers, 
    getLikedPosts,
    getUserPosts,
    getPfpByEmail,
    editProfile,
    removeProfilePicture,
    getProfile,
    deleteUserAccount,
    editPost,
    getAllUsernames,


}