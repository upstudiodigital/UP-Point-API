import { api } from "../../../config/fetchConfig"; 



class CheckoutPaymentGenerateSession3DSService {
    async execute(){
        let responseSession3DS = await api({
          baseURL: `${process.env.PAGBANK_URL_SDK}/checkout-sdk`,
          method: "POST",
          endpoint: "/sessions",
          data: JSON.stringify({}),
          });

          return {
            data: {
              items: responseSession3DS.error_messages ? "Ocorreu erros na API PAGBANK referênte ao checkout 3DS" : responseSession3DS,
              status: responseSession3DS.error_messages ? 400 : 200,
            },
           
          }



    }
}

export {CheckoutPaymentGenerateSession3DSService}