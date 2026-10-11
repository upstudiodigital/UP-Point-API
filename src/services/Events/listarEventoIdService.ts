import prismaClient from "../../prisma";

interface listarEventosIdType {
    id: string;
   
}

class ListarEventoIdService {
    async execute({id}: listarEventosIdType){
        const listarEventoId = await prismaClient.events.findFirst({
            where: {
                id: id,
                status: true,
            },
            include: { 
               categories: true,
           }
        })

        return listarEventoId

    }
}

export {ListarEventoIdService}
