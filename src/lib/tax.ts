export type TaxRate = 8 | 10;

export const DEFAULT_TAX_RATE: TaxRate = 10;
export const TAX_RATES: TaxRate[] = [8, 10];

export const roundCurrencyAmount = (amount: number) => Math.round(amount);

export const calculateTaxIncludedPrice = (
  taxExcludedPrice: number,
  taxRate: TaxRate,
) => roundCurrencyAmount(taxExcludedPrice * (100 + taxRate) * 0.01);

export const calculateTaxExcludedPrice = (
  taxIncludedPrice: number,
  taxRate: TaxRate,
) => roundCurrencyAmount((taxIncludedPrice * 100) / (100 + taxRate));

export const isTaxRate = (value: number): value is TaxRate =>
  TAX_RATES.includes(value as TaxRate);
