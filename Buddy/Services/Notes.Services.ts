import { getNotesByUserIdRepository } from "../Repository/Notes.repository";



export const getNotesByUserIdServices = async (userId: string, spaceId:string, limit:number,cursor:string) => {
    try {
     const response = await getNotesByUserIdRepository(userId,spaceId,limit,cursor);
     return response;    
    } catch (error) {
    console.log("error in Notes service Layer ", error);
    throw error;  
    }
}
