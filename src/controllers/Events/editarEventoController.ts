import { Request, Response } from "express";
import { EditarEventosService } from "../../services/Events/editarEventoService";

class EditarEventoController {
  async handle(req: Request, res: Response) {
    const id_user_logged = req.user_id
  
    const {
      id,
      idProduct,
      idCategory,
      name,
      description,
      localityEvent,
      urlLocalityEvent,
      bannerImageUrl,
      dateEvent,
      hourEvent,
      restrictionsEvent,
      placesPurchaseTicket,
      urlPostSocialNetwork,
      phoneForContact,
    } = req.body;

    const editarEvento = new EditarEventosService();

    const eventoEditado = await editarEvento.execute({
      id,
      idUserOwner: id_user_logged,
      idProduct,
      idCategory,
      name,
      description,
      localityEvent,
      urlLocalityEvent,
      bannerImageUrl,
      dateEvent,
      hourEvent,
      restrictionsEvent,
      placesPurchaseTicket,
      urlPostSocialNetwork,
      phoneForContact,
    });

    return res.json(eventoEditado);
  }
}

export { EditarEventoController };
