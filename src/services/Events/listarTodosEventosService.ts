import prismaClient from "../../prisma";

interface IListarTodosEventosService {
    nome: string
}
class ListarTodosEventosService {
    async execute({nome}: IListarTodosEventosService){
        const listarTodosEventos = await prismaClient.events.findMany({
            where: {
                status: true,
                name: {
                    contains: nome,
                    mode: "insensitive",
                }
            },
            include: { 
                categories: true,
            }
 
        })

        return listarTodosEventos 

        
    }
}

export {ListarTodosEventosService}
