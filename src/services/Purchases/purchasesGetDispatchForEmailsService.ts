import path from "path";
import fs from "fs";
import prismaClient from "../../prisma";
import { transporter } from "../../config/nodemailerConfig";  
import { GetDetailsPurchasesService } from "./purchesesGetDetailsService";
import { formatterCurrency } from "../../utils/formatters/formatterPrice";
import { formatterCPF } from "../../utils/formatters/formatterCPF";
import { formatterDateToString } from "../../utils/formatters/formatterDate";
import { TypePerson } from "../../keys/typePerson/typePerson";

interface IGetDispatchPurchasesForEmails {
  idUserLogged?: string | null;
  idVoucher?: string | null;
  idOtherUser?: string | null
}

class GetDispatchPurchasesForEmailsService {
  async execute({ idUserLogged, idVoucher,idOtherUser }: IGetDispatchPurchasesForEmails) {
    if (!idVoucher || !idUserLogged) {
      return {
        data: {
          message: !idVoucher
            ? "Não foi possível prosseguir, o id do voucher não foi informado."
            : "Não foi possível prosseguir, o id do responsável não foi informado.",
          status: 400,
        },
      };
    }

    const userExists = await prismaClient.users.findFirst({
      where: { 
        id: idUserLogged, 
      },
    });

    const purchasesExists = await prismaClient.purchases.findFirst({
      where: {
        id: idVoucher,
        //idUser: idUserLogged
      }
    })

    if(!purchasesExists){
      return {
        data: {
          message: "Não foi possível prosseguir, o voucher da compra não foi emitido e não existe.",
          status: 404,
        },
      };
    }


    if (!userExists) {
      return {
        data: {
          message: "Não foi possível prosseguir, o usuário responsável não existe.",
          status: 404,
        },
      };
    }

    const getDetailsVoucher = new GetDetailsPurchasesService();
    const dataResponseDetailsVoucher = await getDetailsVoucher.execute({
      id: idVoucher,
      idUserLogged,
      idOtherUser,
    });

    const seeMyPurchasesLink = `${process.env.FRONTEND_URL}${process.env.LINK_SEE_MY_PURCHASES_URL}`;
    const templatePathClient = path.join(__dirname, "../../constants/templates/templateVoucherClient.html");
    const templatePathAdminResort = path.join(__dirname, "../../constants/templates/templateVoucherAdminResort.html");

    const readTemplate = (templatePath: string, replacements: Record<string, string | undefined>) => {
      let content = fs.readFileSync(templatePath, "utf-8");
      for (const [key, value] of Object.entries(replacements)) {
        if(value) content = content.replace(`{{${key}}}`, value);
      }
      return content;
    };

    const replacements = {
      seeMyPurchasesLink: seeMyPurchasesLink,
      userName: userExists.name.split(" ")[0],
      idUser: userExists.id,
      name: userExists.name,
      methodPayment: dataResponseDetailsVoucher.data.items.dataDetailsVoucherFormated.methodsPayments.name,
      ...(userExists.typePerson === TypePerson.Fisic ? {cpf: formatterCPF(userExists.cpfCnpj)} : { cnpj: formatterCPF(userExists.cpfCnpj),}),
      datePayment: formatterDateToString(dataResponseDetailsVoucher?.data?.items?.dataDetailsVoucherFormated?.datePayment),
      totalPrice: formatterCurrency(dataResponseDetailsVoucher?.data?.items?.dataDetailsVoucherFormated?.totalPrice),
      codeVoucher: dataResponseDetailsVoucher?.data?.items?.dataDetailsVoucherFormated?.id,
      codePayment: dataResponseDetailsVoucher?.data?.items?.dataDetailsVoucherFormated?.codePayment,
      codeReferencePayment: dataResponseDetailsVoucher?.data?.items?.dataDetailsVoucherFormated?.codeReferencePayment,
      products: typeof dataResponseDetailsVoucher?.data?.items?.dataDetailsVoucherFormated?.products === "string"
      ? JSON.parse(dataResponseDetailsVoucher?.data?.items?.dataDetailsVoucherFormated?.products)
      : dataResponseDetailsVoucher?.data?.items?.dataDetailsVoucherFormated?.products
    };

    const htmlContentBuyClient = readTemplate(templatePathClient, replacements);
    const htmlContentResortAdmin = readTemplate(templatePathAdminResort, replacements);

    const mailOptions = [
      {
        from: `"Up Point" <${process.env.EMAIL_USER_PASSPORT}>`,
        to: userExists.email,
        subject: "🎉 Parabéns pela compra! Confira seu comprovante!",
        html: htmlContentBuyClient,
        messageId: `<${Date.now()}-${Math.random().toString(36).slice(2)}>`,
        headers: { "X-Entity-Ref-ID": `${Date.now()}` },
      },
      {
        from: `"Up Point" <${process.env.EMAIL_USER_PASSPORT}>`,
        to: process.env.EMAIL_USER_PASSPORT,
        subject: `Confirmação de compra para o cliente ${userExists.name}`,
        html: htmlContentResortAdmin,
        messageId: `<${Date.now()}-${Math.random().toString(36).slice(2)}>`,
        headers: { "X-Entity-Ref-ID": `${Date.now()}` },
      },
    ];

    try {
      await Promise.all(mailOptions.map((options) => transporter({
        authEmail: process.env.EMAIL_USER_PASSPORT,
        authPassword: process.env.EMAIL_PASSWORD_PASSPORT
      }).sendMail(options)));

      return {
        data: {
          message: "Email de confirmação de compra enviado para o cliente e o Up Point!",
          status: 200,
        },
      };
    } catch (err) {
      console.error(err);
      return {
        data: {
          message: "Erro ao enviar email de confirmação de compra.",
          status: 500,
        },
      };
    }
  }
}

export { GetDispatchPurchasesForEmailsService };
