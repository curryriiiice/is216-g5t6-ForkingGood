import * as service from '../models/friendsService.js';

// insert functions here 
// eg 
// const inviteGroupMembers = async (req, res) => {xxxx}
const getFriends = async (req, res) => {
    // get user_email from FE
    const { user_email } = req.body;
    // check if user_email is received 
    if (!user_email) {
        return res.status(400).json({ error: "User email is required" });
    }

    const { data, error: getFriendsError } = await service.getFriends(user_email);

    if (getFriendsError) {
        return res.status(500).json({ message: "Error getting user's friends" });
    }

    return res.status(200).json({ data });
} 
// tested, works
// returns a JSON containing an array of the user's friends with data as the key, eg {data: [email1, email2]}


const acceptFriendReq = async (req, res) => {
    // get data from FE
    const { user_email, friend_email } = req.body;
    
    // check if everything is received 
    if (!user_email || !friend_email) {
        return res.status(400).json({ error: "Missing information!" });
    }

    const { data, error: acceptFriendReqError } = await service.acceptFriendReq(user_email, friend_email);

    if (acceptFriendReqError) {
        return res.status(500).json({ message: "Error accepting friend request" });
    }

    return res.status(200).json({ message: "Friend request accepted!" });
};
// tested, works


const rejectFriendReq = async (req, res) => {
    // get data from FE
    const { user_email, friend_email } = req.body;
    
    // check if everything is received 
    if (!user_email || !friend_email) {
        return res.status(400).json({ error: "Missing information!" });
    }

    const { data, error: acceptFriendReqError } = await service.rejectFriendReq(user_email, friend_email);

    if (acceptFriendReqError) {
        return res.status(500).json({ message: "Error rejecting friend request" });
    }

    return res.status(200).json({ message: "Friend request rejected!" });
};
// tested, works


const sendFriendReq = async (req, res) => {
    // get data from FE
    const { user_email, friend_email } = req.body;
    
    // check if everything is received 
    if (!user_email || !friend_email) {
        return res.status(400).json({ error: "Missing information!" });
    }

    const { data, error: sendFriendReqError } = await service.sendFriendReq(user_email, friend_email);

    if (sendFriendReqError) {
        return res.status(500).json({ message: "Error sending friend request" });
    }

    return res.status(200).json({ message: "Friend request sent successfully!" });
};
// tested, works

const getPendingFriendReqs = async (req, res) => {
    // get data from FE
    const { user_email } = req.body;
    
    // check if everything is received 
    if (!user_email) {
        return res.status(400).json({ error: "Missing information!" });
    }

    const { data, error: getPendingReqsError } = await service.getPendingFriendReqs(user_email);

    if (getPendingReqsError) {
        return res.status(500).json({ message: "Error getting pending friend requests" });
    }

    return res.status(200).json({ data });
};
// tested, works

const commentPost = async (req, res) => {
    // get data from FE
    const { postid, commenter_email, comment } = req.body;
    
    // check if everything is received 
    if (!postid || !commenter_email || !comment) {
        return res.status(400).json({ error: "Missing information!" });
    }

    const { data, error: commentError } = await service.commentPost(postid, commenter_email, comment);

    if (commentError) {
        return res.status(500).json({ message: "Error commenting on this user's post" });
    }

    return res.status(200).json({ message: "Commented successfully!" });
};
// tested, works

const getCommentsbyPostId = async (req, res) => {
    // get data from FE
    const { postid } = req.body;
    
    // check if everything is received 
    if (!postid) {
        return res.status(400).json({ error: "Missing information!" });
    }

    const { data, error: getCommentsError } = await service.getCommentsbyPostId(postid);

    if (getCommentsError) {
        return res.status(500).json({ message: "Error commenting on this user's post" });
    }

    return res.status(200).json({ data });
};
// tested, works

const likePost = async (req, res) => {
    // get data from FE
    const { postid, liker_email } = req.body;
    
    // check if everything is received 
    if (!postid || !liker_email) {
        return res.status(400).json({ error: "Missing information!" });
    }

    const { data, error: likeError } = await service.likePost(postid, liker_email);

    if (likeError) {
        return res.status(500).json({ message: "Error liking on this user's post" });
    }

    return res.status(200).json({ message: "Liked successfully!" });
};
// tested, works

const unlikePost = async (req, res) => {
    // get data from FE
    const { postid, liker_email } = req.body;
    
    // check if everything is received 
    if (!postid || !liker_email) {
        return res.status(400).json({ error: "Missing information!" });
    }

    const { data, error: unlikeError } = await service.unlikePost(postid, liker_email);

    if (unlikeError) {
        return res.status(500).json({ message: "Error unliking on this user's post" });
    }

    return res.status(200).json({ message: "Unliked successfully!" });
};
// tested, works


const getLikesbyPostId = async (req, res) => {
    // get data from FE
    const { postid } = req.body;
    
    // check if everything is received 
    if (!postid) {
        return res.status(400).json({ error: "Missing information!" });
    }

    const { data, error: getLikesError } = await service.getLikesbyPostId(postid);

    if (getLikesError) {
        return res.status(500).json({ message: "Error commenting on this user's post" });
    }

    return res.status(200).json({ data });
};
// tested, works



export{
    getFriends, 
    acceptFriendReq, 
    rejectFriendReq,
    sendFriendReq, 
    getPendingFriendReqs, 
    commentPost,
    getCommentsbyPostId, 
    likePost,
    unlikePost, 
    getLikesbyPostId,
    


}