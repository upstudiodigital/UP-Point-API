import prismaClient from "../../prisma";


interface DeletarEventoIdType {
   id: string
   idUserOwner: string
}


class DeletarEventoService {
    async execute({id, idUserOwner}: DeletarEventoIdType){
        const event = await prismaClient.events.findFirst({where: {id, idUserOwner}});
        if (!event) throw new Error('Evento não encontrado ou sem permissão.');
        const deletarEvento = await prismaClient.events.delete({
            where: {
                id: id
            }
        })    
        return {
            message: `Evento deletado com sucesso`,
            evento: deletarEvento.id,
            status: 200
        }
    }
}

export {DeletarEventoService}
