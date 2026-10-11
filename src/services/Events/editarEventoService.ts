import prismaClient from "../../prisma";

interface EditarEventoServiceType {
  id: string;
  idUserOwner: string;
  idProduct: string;
  name: string;
  description: string;
  localityEvent: string;
  urlLocalityEvent: string;
  bannerImageUrl: string;
  dateEvent: string;
  hourEvent: string;
  idCategory: string; 
  restrictionsEvent?: string;
  placesPurchaseTicket: string;
  urlPostSocialNetwork: string;
  phoneForContact?: string;
  status?: boolean | null
}

class EditarEventosService {
  async execute({
    id,
    idUserOwner,
    idProduct,
    name,
    description,
    localityEvent,
    urlLocalityEvent,
    bannerImageUrl,
    dateEvent,
    hourEvent,
    idCategory,
    restrictionsEvent,
    placesPurchaseTicket,
    urlPostSocialNetwork,
    phoneForContact,
    status
  }: EditarEventoServiceType) {


    const owned = await prismaClient.events.findFirst({where: {id, idUserOwner}});
    if (!owned) throw new Error('Evento não encontrado ou sem permissão.');


    const editar = await prismaClient.events.update({
      where: {
        id: id,
      },

      data: {
      name: name,
      
      description: description,
      idProduct: idProduct,
      idCategory: idCategory,
      localityEvent: localityEvent,
      urlLocalityEvent: urlLocalityEvent,
      bannerImageUrl: owned.bannerImageUrl,
      dateEvent: dateEvent,
      hourEvent: hourEvent,
      restrictionsEvent: restrictionsEvent,
      placesPurchaseTicket: placesPurchaseTicket,
      urlPostSocialNetwork: urlPostSocialNetwork,
      phoneForContact: phoneForContact,
      status: status ?? owned.status,
      },
    });
    return editar;
  }
}

export { EditarEventosService };
