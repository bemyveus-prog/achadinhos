import { gql } from "./lib/shopee.mjs";
const t = await gql(`{ __type(name: "ProductOfferV2") { fields { name type { name kind ofType { name } } } } }`).catch((e) => ({ erro: e.message }));
console.log("CAMPOS ProductOfferV2:", JSON.stringify(t?.__type?.fields?.map((f) => f.name) ?? t));
const q = await gql(`{ productOfferV2(keyword: "serrote podador", sortType: 2, page: 1, limit: 3) { nodes { itemId productName sales ratingStar } } }`).catch((e) => ({ erro: e.message }));
console.log("EXEMPLO:", JSON.stringify(q));
const t2 = await gql(`{ __schema { queryType { fields { name } } } }`).catch((e) => ({ erro: e.message }));
console.log("QUERIES:", JSON.stringify(t2?.__schema?.queryType?.fields?.map((f) => f.name) ?? t2));
