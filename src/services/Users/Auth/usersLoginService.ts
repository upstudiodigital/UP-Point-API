import prismaClient from "../../../prisma";
import { compare } from "bcryptjs";
import { sign } from "jsonwebtoken";

interface IUsersLoginService {
  account: string;
  password: string;
}

class UsersLoginService {
  async execute({ account, password }: IUsersLoginService) {
    if (!account) {
      return {
        data: {
          message: "Por favor, informe seu e-mail, CPF ou CNPJ para continuar.",
          status: 400,
        },
      };
    }

    if (!password) {
      return {
        data: {
          message: "Por favor, informe sua senha para continuar.",
          status: 400,
        },
      };
    }

    const users = await prismaClient.users.findFirst({
      where: {
        OR: [
          {
            cpfCnpj: account,
          },
          {
            email: account
          },
        ]
    
    
      },
    });

    if (!users) {
      return {
        data: {
          message:
            "Não foi possível prosseguir, este E-mail, CPF ou CNPJ não existe.",
          status: 404,
        },
      };
    }

    const verifyPassword = await compare(password, users.password);

    if (!verifyPassword) {
      return {
        data: {
          message: "Não foi possível prosseguir, sua senha está incorreta.",
          status: 401,
        },
      };
    }

    const token = sign(
      {
        id: users.id,
        name: users.name,
      },
      process.env.JWT_SECRET,
      {
        subject: users.id,
        expiresIn: "8h",
        algorithm: "HS256",
      }
    );

    return {
      data: {
        message: `Bem Vindo ${users.name.split(" ")[0].charAt(0).toUpperCase()}${users.name.split(" ")[0].slice(1).toLocaleLowerCase()}`,
        userId: users.id,
        token: token,
        status: 200
      }

    };
  }
}

export { UsersLoginService };
