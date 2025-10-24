import express from "express";
import multer from 'multer';

const router = express.Router();

// middleware to process pictures
const upload = multer({ storage: multer.memoryStorage() });

//import {task1,task2,etc} from "../controllers/taskController";
import {
	getPostbyId,
	getUsernamebyEmail,
	createPost,
	deletePost,
	getAllUsernames, 
	getLikedPosts,
	getUserPosts,

}from '../controllers/userController.js';

//router.get
//router.post etc etc for each of the routes
// eg router.post('/getGroups',getGroups);

router.post("/getPostbyId", getPostbyId);
router.post("/getUsernamebyEmail", getUsernamebyEmail);
router.post("/createPost", upload.array('photos'), createPost);
router.delete("/deletePost", deletePost); 
router.get("/getAllUsernames", getAllUsernames); 
router.post("/getLikedPosts", getLikedPosts);
router.post("/getUserPosts", getUserPosts); 

export default router;