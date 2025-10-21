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
router.post("/unlikePost", unlikePost);
router.post("/getLikesbyPostId", getLikesbyPostId); 

export default router;