import { Request,Response } from "express";
import { CadastrarEventoService } from "../../services/Events/cadastrarEventoService";
import { UploadedFile } from "express-fileupload";
import { v2 as cloudinary } from "cloudinary";
import { UploadApiResponse } from "cloudinary";
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_NAME,
    api_key: process.env.CLOUDINARY_KEY,
    api_secret: process.env.CLOUDINARY_SECRET
})
interface IResponseCadastrarEventoController {
    status?: number
    message?: string
  }


class CadastrarEventoController {
    async handle(req: Request, res: Response){
        const id_user_logged = req.user_id
        const { 
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

        const cadastrarEvento = new CadastrarEventoService()
       
            const file = req.files?.['bannerEvento'];
            if (!file || Array.isArray(file) || !['image/jpeg', 'image/png'].includes(file.mimetype) || file.size > 5 * 1024 * 1024) {
              return res.status(400).json({ message: 'Selecione uma imagem JPG ou PNG de até 5 MB.' });
            }

            if (Array.isArray(file)) {
              // Se for um array, use o primeiro arquivo ou faça o que for necessário
              throw new Error("Only one file is allowed for 'bannerEvento'");
            } else {
              const resultFile: UploadApiResponse = await new Promise((resolve, reject) => {
                cloudinary.uploader.upload_stream({}, (error, result) => {
                  if (error) {
                    reject(error);
                  }
                  resolve(result);
                }).end(file.data);
              });
              
            const eventoCadastrado = await cadastrarEvento.execute({ 
              idUserOwner: id_user_logged,
              idProduct,
              idCategory,
              name,
              description,
              localityEvent,
              urlLocalityEvent,
              bannerImageUrl: resultFile.secure_url,
              dateEvent,
              hourEvent,
              restrictionsEvent,
              placesPurchaseTicket,
              urlPostSocialNetwork,
              phoneForContact,
             }) as IResponseCadastrarEventoController
             
             if(eventoCadastrado.status === 403){
                return res.status(403).json(eventoCadastrado)
             }

            return res.json(eventoCadastrado)

        }
   
    }

}

export {CadastrarEventoController}
