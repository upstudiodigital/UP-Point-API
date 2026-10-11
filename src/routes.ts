import { Router, Request, Response } from "express";
import multer from "multer";
import uploadConfig from "../src/config/multer";

import { isLogged } from "./middlewares/isLogged";

// Controllers importados...
import { UsersRegisterController } from "./controllers/Users/Auth/usersRegisterController";
import { UsersLoginController } from "./controllers/Users/Auth/usersLoginController";
import { UsersGetDetailsController } from "./controllers/Users/usersGetDetailsController";
import { UsersDeleteController } from "./controllers/Users/usersDeleteController";
import { CategoriesRegisterController } from "./controllers/Categories/categoriesRegisterController";
import { CategoriesGetAllController } from "./controllers/Categories/categoriesGetAllController";
import { CategoriesGetDetailsController } from "./controllers/Categories/categoriesGetDetailsController";
import { CategoriesEditController } from "./controllers/Categories/categoriesEditController";
import { CategoriesDeleteController } from "./controllers/Categories/categoriesDeleteController";
import { CadastrarEventoController } from "./controllers/Events/cadastrarEventoController";
import { ListarTodosEventosController } from "./controllers/Events/listarTodosEventosController";
import { ListarEventoIdController } from "./controllers/Events/listarEventoIdController";
import { EditarEventoController } from "./controllers/Events/editarEventoController";
import { DeletarEventoController } from "./controllers/Events/deletarEventoController";
import { UsersEditController } from "./controllers/Users/usersEditController";
import { UsersGetAllController } from "./controllers/Users/usersGetAllController";
import { ProductRegisterController } from "./controllers/Products/productsRegisterController";
import { ProductGetAllController } from "./controllers/Products/productsGetAllController";
import { ProductsDeleteController } from "./controllers/Products/productDeleteController";
import { ProductGetDetailsController } from "./controllers/Products/productsGetDetailsController";
import { ProductsEditController } from "./controllers/Products/productsEditController";
import { UsersGetAllListController } from "./controllers/Users/usersListUsersController";
import { RecoverPasswordController } from "./controllers/Users/PasswordRecover/recoverPasswordUserController";
import { RedefinePasswordController } from "./controllers/Users/PasswordRecover/redefinePasswordUserController";
import { AllowAccessUserController } from "./controllers/Users/Permissions/allowAccessUserController";
import { AllowUpdateTutorialFirstAccessController } from "./controllers/Users/Permissions/allowUpdateTutorialFirstAccessController";
import { AllowUpdateTermsController } from "./controllers/Users/Permissions/allowUpdateTermsController";
import { UsersRegisterOtherController } from "./controllers/Users/usersRegisterController";
import { BinDeleteItemsController } from "./controllers/Bin/binDeleteItemsController";
import { BinEditItemsController } from "./controllers/Bin/binEditItemsController";
import { BinRegisterMoveItemsController } from "./controllers/Bin/binRegisterMoveItemsController";
import { BinGetDetailsItemsController } from "./controllers/Bin/binGetDetailsItemsController";
import { BinGetAllItemsController } from "./controllers/Bin/binGetAllItemsController";
import { BinRestoreItemsController } from "./controllers/Bin/binRestoreItemsController";
import { RegisterMethodPaymentController } from "./controllers/MethodsPayments/registerMethodPaymentController";
import { EditMethodPaymentController } from "./controllers/MethodsPayments/editMethodPaymentController";
import { GetAllMethodPaymentController } from "./controllers/MethodsPayments/getAllMethodPaymentController";
import { GetDetailsMethodPaymentController } from "./controllers/MethodsPayments/getDetailsMethodPaymentController";
import { DeleteMethodPaymentController } from "./controllers/MethodsPayments/deleteMethodPaymentController";
import { RegisterCouponController } from "./controllers/Coupons/registerCouponController";
import { EditCouponController } from "./controllers/Coupons/editCouponController";
import { GetAllCouponController } from "./controllers/Coupons/getAllCouponController";
import { GetDetailsCouponController } from "./controllers/Coupons/getDetailsCouponController";
import { GetActiveCouponController } from "./controllers/Coupons/getActiveCouponController";
import { DeleteCouponController } from "./controllers/Coupons/deleteCouponController";
import { RegisterUseCouponController } from "./controllers/Coupons/CouponUsageController/registerUseCouponController";
import { GetCouponUsageController } from "./controllers/Coupons/CouponUsageController/getCouponUsageService";
import { EditCouponUsageController } from "./controllers/Coupons/CouponUsageController/editCouponUsageController";
import { DeleteCouponUsageController } from "./controllers/Coupons/CouponUsageController/deleteCouponUsageService";
import { CheckoutPaymentController } from "./controllers/CheckoutPaymentMethod/checkoutPaymentMethodController";
import { CheckoutPaymentGenerateSession3DSController } from "./controllers/CheckoutPaymentMethod/sessioncheckout3DS/checkoutPaymentGenerateSession3DSController";
import { CheckoutPaymentGeneratePublicKeyController } from "./controllers/CheckoutPaymentMethod/sessionPublicKeyCard/checkoutPaymentGeneratePublicKeyController";
import { CheckoutPaymentConsultPublicKeyController } from "./controllers/CheckoutPaymentMethod/sessionPublicKeyCard/checkoutPaymentConsultPublicKeyController";
import { CheckoutStatusPaymentController } from "./controllers/CheckoutPaymentMethod/checkoutStatusPaymentController";
import { CheckoutGetStatusPaymentController } from "./controllers/CheckoutPaymentMethod/checkoutGetStatusPaymentController";
import { PurchasesDeleteController } from "./controllers/Purchases/purchasesDeleteController";
import { PurchasesEditController } from "./controllers/Purchases/purchasesEditController";
import { PurchasesRegisterController } from "./controllers/Purchases/purchasesRegisterController";
import { GetDispatchPurchasesForEmailsController } from "./controllers/Purchases/purchasesGetDispatchForEmailsController";
import { GetDetailsPurchasesController } from "./controllers/Purchases/purchesesGetDetailsController";
import { GetAllPurchasesController } from "./controllers/Purchases/purchasesGetAllController";

const router: Router = Router();
const upload = multer(uploadConfig.upload("./tmp"));

// Endpoint de verificação
router.get("/", (req: Request, res: Response) => {
  return res.status(200).json({
    status: 200,
    message: "API disponível e online",
  });
});

// Auth
router.post("/auth/login", new UsersLoginController().handle);
router.post("/auth/register", new UsersRegisterController().handle);
router.post("/auth/recoverpassword", new RecoverPasswordController().handle);
router.post("/auth/redefinepassword", new RedefinePasswordController().handle);

// Users
router.post("/users", new UsersRegisterOtherController().handle);
router.get("/users/list", isLogged, new UsersGetAllListController().handle);
router.get("/users/:id", isLogged, new UsersGetDetailsController().handle);
router.delete("/users/:id", isLogged, new UsersDeleteController().handle);
router.put("/users", isLogged, new UsersEditController().handle);
router.get("/users", isLogged, new UsersGetAllController().handle);
router.put(
  "/users/permissions",
  isLogged,
  new AllowAccessUserController().handle
);
router.put(
  "/users/firstAcess",
  isLogged,
  new AllowUpdateTutorialFirstAccessController().handle
);
router.put("/users/terms", isLogged, new AllowUpdateTermsController().handle);

// rotas para cadastrar métodos de pagamento apenas admin ou master pode
router.post(
  "/methodspayments",
  isLogged,
  new RegisterMethodPaymentController().handle
); // endpoint para cadastrar método de pagamento apenas acesso master
router.put(
  "/methodspayments",
  isLogged,
  new EditMethodPaymentController().handle
); // endpoint editar método de pagamento apenas acesso master
router.get(
  "/methodspayments",
  isLogged,
  new GetAllMethodPaymentController().handle
); // endpoint para buscar as todas os métodos de pagamento cadastrados apenas acesso master
router.get(
  "/methodspayments/:id",
  isLogged,
  new GetDetailsMethodPaymentController().handle
); // endpoint para buscar detalhes do método de pagamento
router.delete(
  "/methodspayments/:id",
  isLogged,
  new DeleteMethodPaymentController().handle
); // endpoint para deletar métodos de pagamento apenas acesso master

// rotas para cupons de desconto

router.post("/coupons", isLogged, new RegisterCouponController().handle),
  router.put("/coupons", isLogged, new EditCouponController().handle),
  router.get("/coupons", isLogged, new GetAllCouponController().handle);
router.get("/coupons/:id", isLogged, new GetDetailsCouponController().handle);
router.get(
  "/coupons/active/:id",
  isLogged,
  new GetActiveCouponController().handle
);
router.delete("/coupons/:id", isLogged, new DeleteCouponController().handle),
  router.post(
    "/coupons/use",
    isLogged,
    new RegisterUseCouponController().handle
  );

router.get("/couponsusage", isLogged, new GetCouponUsageController().handle);
router.put("/couponsusage", isLogged, new EditCouponUsageController().handle);
router.delete(
  "/couponsusage",
  isLogged,
  new DeleteCouponUsageController().handle
);

router.post(
  "/checkoutpayments",
  isLogged,
  new CheckoutPaymentController().handle
); // endpoint para gerar checkout e pagar o produto, cartão de crédito, debito e pix, ele recebe os dados e efetua a compra do produto com pagbank
router.get(
  "/checkoutpayments/generate/session3ds",
  isLogged,
  new CheckoutPaymentGenerateSession3DSController().handle
); // endpoint para gerar session3ds para efetuar compras com cartão de débito usa o id session no front para gerar o authentication method
router.post(
  "/checkoutpayments/generate/publickeycard",
  isLogged,
  new CheckoutPaymentGeneratePublicKeyController().handle
); // endpoint para gerar uma public key para cartões de crédito e débito no meu token de produção ou sandbox
router.get(
  "/checkoutpayments/generate/publickey/consult",
  isLogged,
  new CheckoutPaymentConsultPublicKeyController().handle
); // endpoint para consultar chave publica de cartão gerado

// endpoint para cadastrar categoria se estiver logado MasterAcesss true
router.post(
  "/checkoutpayments/api/statuspayment",
  new CheckoutStatusPaymentController().handle
); // endpoint webhook que vem a resposta do pagban dk
router.get(
  "/checkoutpayments/api/statuspayment/:id",
  isLogged,
  new CheckoutGetStatusPaymentController().handle
);

//endpoints para Vouchers de compras
router.get("/purchases", isLogged, new GetAllPurchasesController().handle); //endpoint para buscar todos os cursos com filtros sem precisar estar logado
router.get(
  "/purchases/:id",
  isLogged,
  new GetDetailsPurchasesController().handle
); // endpoint para buscar o curso pelo id, sem precisar estar logado
router.get(
  "/purchases/dispatchEmails/:id",
  isLogged,
  new GetDispatchPurchasesForEmailsController().handle
);
router.post("/purchases", isLogged, new PurchasesRegisterController().handle); //endpoint para cadastrar um novo curso, passando o id da categoria e o id do author que está cadastrando se estiver logado com masterAccess True
router.put("/purchases", isLogged, new PurchasesEditController().handle); //endpoint para editar o curso cadastrado  se estiver logado com masterAccess True .
router.delete(
  "/purchases/:id",
  isLogged,
  new PurchasesDeleteController().handle
); // endpoint para deletar curso cadastrado  se estiver logado com masterAccess True

// Bin
router.post("/bin", isLogged, new BinRegisterMoveItemsController().handle);
router.get("/bin/:id", isLogged, new BinRestoreItemsController().handle);
router.put("/bin", isLogged, new BinEditItemsController().handle);
router.get("/bin", isLogged, new BinGetAllItemsController().handle);
router.get("/bin", isLogged, new BinGetDetailsItemsController().handle);
router.delete("/bin/:id", isLogged, new BinDeleteItemsController().handle);

// Categories
router.post("/categories", isLogged, new CategoriesRegisterController().handle);
router.get("/categories", isLogged, new CategoriesGetAllController().handle);
router.get(
  "/categories/:id",
  isLogged,
  new CategoriesGetDetailsController().handle
);
router.put("/categories", isLogged, new CategoriesEditController().handle);
router.delete(
  "/categories/:id",
  isLogged,
  new CategoriesDeleteController().handle
);

// Events
router.post("/eventos", isLogged, new CadastrarEventoController().handle);
router.get("/eventos", new ListarTodosEventosController().handle);
router.get("/eventos/:id", new ListarEventoIdController().handle);
router.put(
  "/eventos",
  isLogged,
  new EditarEventoController().handle
);
router.delete("/eventos/:id", isLogged, new DeletarEventoController().handle);

// Products
router.post("/produtos", isLogged, new ProductRegisterController().handle);
router.put("/produtos", isLogged, new ProductsEditController().handle);
router.get("/produtos", isLogged, new ProductGetAllController().handle);
router.get("/produtos/:id", isLogged, new ProductGetDetailsController().handle);
router.delete("/produtos/:id", isLogged, new ProductsDeleteController().handle);

export { router };
