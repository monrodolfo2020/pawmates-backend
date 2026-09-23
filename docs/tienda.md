# Tienda (en pausa)

La tienda (Commerce: escaparates de los negocios, catálogo, pedidos y
entrega en el siguiente paseo) está **en pausa, no borrada**. Se quitó el
código que ya nadie usaba para que no estorbe mientras la app es un
directorio de servicios, pero todo se puede recuperar.

## Qué se conserva

- **El código completo**, en la rama `archivo/tienda-v1` de cada repo:
  - backend (`pawmates-backend`): el último commit con `src/commerce/`
    completo, sus controladores, el saga `CommerceProcessManager`, sus
    pruebas y los 4 endpoints de admin (`/v1/admin/storefronts`,
    `/orders`, `/catalog`, `PATCH /catalog/:id`);
  - frontend (`pawmates`): el último commit con las pantallas de la
    tienda (`StoresScreen`, `StorefrontScreen`, `ProductDetailScreen`,
    `CartScreen`, `OrdersScreen`, `ProductPhotosPicker`).
- **Las tablas y sus datos.** Las migraciones de
  `apps/pawmates-api/src/commerce/infra/persistence/migrations/` siguen
  aquí y se siguen ejecutando: una base nueva crea las 6 tablas
  `commerce_*` y siembra los 100 productos del catálogo. Nada de lo que
  ya esté guardado se toca.

## Qué se quitó

- `apps/pawmates-api/src/commerce/` salvo las migraciones: `api/`,
  `domain/`, `infra/adapters/`, `commerce.module.ts`.
- Su registro en `app.module.ts`, `infra/persistence/data-source.ts` e
  `identity.module.ts`.
- En `trips.controller.ts`, la llamada a
  `commerceProcessManager.openDeliveryWindowForBooking()` al terminar un
  paseo.
- Los 4 endpoints de la tienda en `admin.controller.ts`.
- En `libs/common`: `InsufficientStockError`, `OrderDeliveryNotReadyError`,
  `NoUpcomingBookingError`, sus mensajes en `domain-exception.filter.ts` y
  `EVENT_TOPICS.commerce`.

## Cómo retomarla

1. Traer los archivos de la rama de archivo:

   ```sh
   git fetch origin archivo/tienda-v1
   git checkout origin/archivo/tienda-v1 -- apps/pawmates-api/src/commerce
   ```

2. Volver a registrar en `app.module.ts` y en `data-source.ts` las
   entidades (`Storefront`, `Product`, `CatalogItem`, `Order`,
   `OrderLineItem` y el `OutboxEvent` de commerce) y `CommerceModule`.
   Compara con esos dos archivos en la rama de archivo.
3. Restaurar lo de `libs/common` listado arriba (con
   `git show origin/archivo/tienda-v1:libs/common/src/errors/domain-error.ts`
   ves la versión anterior).
4. Si se quiere que la entrega vuelva a depender del paseo, reponer la
   llamada en `TripsController.complete`.
5. Revisar contra lo que cambió desde entonces antes de publicarla:
   - **Cobros.** La tienda cobraba con un adaptador de pagos falso. Hoy
     PawMates no procesa pagos (Términos para dueños §8) y el Acuerdo de
     prestadores dice que no cobra comisión (3.3). Vender productos es
     otro modelo: habrá que actualizar los documentos legales y la
     facturación.
   - **Permisos.** Los endpoints de pedidos se escribieron antes de que
     se exigiera ser participante de una reserva (ver
     `assertParticipant` en `booking.controller.ts`). Aplicar el mismo
     criterio a pedidos y escaparates.
   - **Fotos.** Las fotos de productos usaban el almacenamiento público
     de Blob; está bien para productos, pero confirma que sigue así.
   - **Categoría "tienda".** Se eliminó del directorio
     (migración `RemoveShopCategory`); si vuelve, hay que reponerla en
     `SERVICE_CATEGORIES` de los dos repos.
6. En el frontend, traer las pantallas con
   `git checkout origin/archivo/tienda-v1 -- src/screens/StoresScreen.tsx ...`
   y volver a registrarlas en `RootNavigator.tsx`. El diseño cambió
   bastante desde entonces (colores, navegación), así que tómalas como
   punto de partida, no como algo listo.
