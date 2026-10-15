import { api } from "../../../config/fetchConfig"; 


class CheckoutPaymentGeneratePublicKeyService {
    async execute({type}: {type: string}){
      if(!type){
        return {
          data: {
            message: "Não é possível prosseguir com a ação, envie o tipo de chave que você deseja gerar (Tipos Aceitos: card)",
            status: 400
          }
        }
        
      }

      let responsePublicKey: any = await fetch(`${process.env.PAGBANK_URL}/public-keys/card`, {
        method: "POST",
        headers: {
          'accept': '*/*', 
          "Content-Type": "application/json",
          "Authorization": process.env.PAGBANK_TOKEN!,
        },
        body: JSON.stringify({ type })
      });  
      
      // Consuma o corpo da resposta apenas uma vez
      const responseBody = await responsePublicKey.json();
          return {
            data: {
              items: responsePublicKey.error_messages ? "Ocorreu erros na API PAGBANK referênte ao public key" : responseBody,
              status: responsePublicKey.error_messages ? 400 : 200,
            },
           
          }



    }
}

export {CheckoutPaymentGeneratePublicKeyService}