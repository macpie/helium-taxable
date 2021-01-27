# Helium Taxable

Create CSV files of your accounts' reward history via helium's API and Coingecko.

## Disclaimer

This is not official tax advice. Use at your own risk.

## Usage

1. Edit `docker-compose.yaml`
   1. Set your `HT_ADDRESSES` (comma separated)
   2. Set your desired dates `HT_START_DATE` `HT_END_DATE` (ex: `'2021-01-01'` format `YYYY-MM-DD`)
2. Run `docker-compose build --force-rm`
3. Run `docker-compose up`
4. Your CSVs are in `./reports`
