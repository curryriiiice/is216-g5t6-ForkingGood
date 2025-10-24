import express from "express";
const router = express.Router();
//import {task1,task2,etc} from "../controllers/taskController";
import {
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
    removeFriend,
    isFriends,
    deleteComment,
    editComment,





}from '../controllers/friendsController.js';

//router.get
//router.post etc etc for each of the routes
// eg router.post('/getGroups',getGroups);

router.post("/getFriends", getFriends);
router.post("/acceptFriendReq", acceptFriendReq);
router.post("/rejectFriendReq", rejectFriendReq);
router.post("/sendFriendReq", sendFriendReq); 
router.post("/getPendingFriendReqs", getPendingFriendReqs);
router.post("/commentPost", commentPost); 
router.post("/getCommentsbyPostId", getCommentsbyPostId); 
router.post("/likePost", likePost); 
router.delete("/unlikePost", unlikePost);
router.post("/getLikesbyPostId", getLikesbyPostId); 
router.delete("/removeFriend", removeFriend);
router.post("/isFriends", isFriends);
router.delete("/deleteComment", deleteComment);
router.patch("/editComment", editComment); 

export default router;