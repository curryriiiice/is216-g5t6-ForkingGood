import express from "express";
import multer from 'multer';

const upload = multer({ storage: multer.memoryStorage() });
const router = express.Router();

//import {task1,task2,etc} from "../controllers/taskController";
import {
    reverseSearch,

}from '../controllers/searchController.js';



//router.get
//router.post etc etc for each of the routes
// eg router.post('/getGroups',getGroups);
router.post('/reverseSearch', upload.single('photo'), reverseSearch);



export default router;