import { FastifyReply, FastifyRequest } from "fastify";
import { string, z } from "zod";
import { db } from "../database";
import { getMessaging } from 'firebase-admin/messaging'
import dayjs from "dayjs";
import { messageService } from "../utils/twilio";


export class AlertsController{
    async create(request: FastifyRequest, reply: FastifyReply){

    const alertSchema = z.object({
        title: z.string(),
        message: z.string(),
        provinceId: string(),
        districtId: z.string()
    });

    const { title, message, provinceId, districtId } = alertSchema.parse(request.body);
console.log("check district")
    const district = await db.district.findUnique({
        where: {
            id: districtId, 
                provinceId
        }
    });

    if(!district) {
        return reply.status(400).send({error: "District doesn't belong to the province"})
    }
    console.log("check subscriber")
    const subscriber = await db.subscriber.findMany({
        select: {
            deviceId: true,
            phone: true
        },

        where: {
            districtId, 
        
            deviceId: {
                not: null
            },
            verified: true
        }
    })

    

    console.log("save alert")

    const alert = await db.alerts.create({
        data: {
            title, 
            message, 
            provinceId, 
            districtId
        },
        select: {
            id: true,
            title: true,
            message: true,
            provinceId: true,
            districtId: true
        }
    })
console.log("twilio working")

   const text = `Alert\nTitle: ${alert.title}\nMessage: ${alert.message}`
    subscriber.forEach(subscriber => {
        console.log(subscriber.phone)
        messageService(text, subscriber.phone)
    })
    const tokens = subscriber.map(e => String(e.deviceId));

    const alertmessage = {
        data: alert,
           tokens
        };

      

      try{
       const response = await getMessaging().sendMulticast(alertmessage);
        console.log(response.successCount + ' messages were sent successfully');

        return reply.status(200).send(alert)   
      }catch(error){
        return reply.status(500).send(' messages were not sent successfully')       
      }


    return reply.status(201).send(alert);
}


async list(request: FastifyRequest, reply: FastifyReply){

    const querySchema = z.object({
        provinceId: z.string().optional(),
        districtId: z.string().optional(),
        page: z.coerce.number().optional()
    })

    const { provinceId, districtId, page = 0 } = querySchema.parse(request.query);

    const alerts = db.alerts.findMany({
        where: {
            provinceId,
            districtId,
            createdAt: {
                gte: dayjs().subtract(28, 'day').format()
            }
        },
        include: {
            province: true,
            district: true
        },

        orderBy: {
            createdAt: 'desc'
        },
        
        skip: page * 10,
        take: 10
    })
    
    return reply.status(200).send(alerts)
}


}