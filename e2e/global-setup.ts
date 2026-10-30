import { testLogin } from './env'
import { keepPriceList } from './helpers'

// Once, before any spec: what every run needs in the test account's clinic
export default async function globalSetup() {
  if (testLogin) await keepPriceList()
}
