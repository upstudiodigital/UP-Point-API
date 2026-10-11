import { Response,Request } from "express";
import { DeletarEventoService } from "../../services/Events/deletarEventoService";

class DeletarEventoController {
    async handle(req: Request,res: Response){

        const {id} = req.params
        const deletarEvento = new DeletarEventoService();

        const eventoDeletado = await deletarEvento.execute({id, idUserOwner: req.user_id})

        return res.json(eventoDeletado)
    }
}

export { DeletarEventoController}
