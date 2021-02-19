const axios = require('axios').default;
const moment = require('moment');
const async = require('async');
const csv = require('csv-stringify')
const fs = require('fs');
const _ = require('lodash');
const colors = require('colors/safe');
const jsonfile = require('jsonfile')

const HELIUM_API = "https://api.helium.io/v1";
const HT_ADDRESSES = process.env.HT_ADDRESSES;
const START_DATE = process.env.HT_START_DATE || moment().subtract(7, 'days').format('YYYY-MM-DD');
const END_DATE = process.env.HT_END_DATE || moment().format('YYYY-MM-DD');
const MAX_DAYS = moment(END_DATE).diff(moment(START_DATE), 'days');

const get_days = (start, end) => {
    let days = [];

    while (moment(start).format('YYYY-MM-DD') != moment(end).format('YYYY-MM-DD')) {
        days.push(moment(start).format('YYYY-MM-DD'));
        start = moment(start).add(1, 'days');
    }

    return days;
};
const prices_file = 'data/prices.json';
const days = get_days(START_DATE, END_DATE);

if (!fs.existsSync(prices_file)) {
    jsonfile.writeFileSync(prices_file, {});
}

const miner_history = (address, callback) => {
    const cached_prices = jsonfile.readFileSync(prices_file);

    const sleep = (ms) => {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    console.log(`getting data from ${moment(START_DATE).format('YYYY-MM-DD')} to ${moment(END_DATE).format('YYYY-MM-DD')} Total: ${MAX_DAYS} Days for ${colors.yellow(address)}`);

    async.parallel({
        mined: (cb) => {
            let results = {};

            async.eachLimit(days, 10, (day, next) => {
                const min_time = moment(day);
                const max_time = moment(day).add(1, 'days');

                axios.get(`${HELIUM_API}/accounts/${address}/rewards/sum?min_time=${min_time.toISOString()}&max_time=${max_time.toISOString()}`)
                    .then((resp) => {
                        const mined = Number(_.get(resp, 'data.data.total', 0).toFixed(2));

                        console.log(`${min_time.format('YYYY-MM-DD')} mined ${mined}HNT`);

                        _.set(results, [day], _.merge({}, _.get(results, [day], {}), {
                            mined: mined,
                            date: day
                        }));

                        next();
                    })
                    .catch((err) => {
                        if (err) console.log(err);
                        next(err)
                    });
            }, (err) => {
                cb(err, results);
            });
        },
        prices: (cb) => {
            let results = {};

            async.eachSeries(days, (day, next) => {
                const date = moment(day);

                if (_.has(cached_prices, day)) {
                    const price = _.get(cached_prices, day);

                    console.log(`${date.format('YYYY-MM-DD')} price $${price} from CACHE`);

                    _.set(results, [day], _.merge({}, _.get(results, [day], {}), {
                        price: price
                    }));

                    next();
                } else {
                    axios.get(`https://api.coingecko.com/api/v3/coins/helium/history?date=${date.format('DD-MM-YYYY')}&localization=false`)
                        .then((resp) => {
                            const price = Number(_.get(resp, 'data.market_data.current_price.usd', 0).toFixed(2));

                            console.log(`${date.format('YYYY-MM-DD')} price $${price} from API`);

                            _.set(results, [day], _.merge({}, _.get(results, [day], {}), {
                                price: price
                            }));

                            if (days.length > 100) {
                                sleep(500).then(next);
                            } else {
                                next();
                            }
                        })
                        .catch((err) => {
                            if (err) console.log(err);
                            next(err)
                        });
                }


            }, (err) => {
                cb(err, results);
            });
        },
    }, function (err, results) {
        if (err) console.log(err);

        jsonfile.writeFileSync(prices_file, _.merge(cached_prices, _.mapValues(results.prices, 'price')), {
            spaces: 2
        });

        const final_data = _
            .chain(results.mined)
            .merge(results.prices)
            .values()
            .sortBy('date')
            .map((d) => {
                d.taxable = Number((d.price * d.mined).toFixed(2));
                return d;
            })
            .value()

        callback(err, final_data);
    });

};

let grand_total =  {
    taxable: 0,
    mined: 0
};

async.eachSeries(_.split(HT_ADDRESSES, ','), (address, callback) => {
    miner_history(address, (err, results) => {
        if (err) callback(err);

        const taxable_total = _.reduce(results, function (sum, r) {
            return sum + r.taxable;
        }, 0);

        const mined_total = _.reduce(results, function (sum, r) {
            return sum + r.mined;
        }, 0);

        grand_total.taxable = grand_total.taxable + taxable_total;
        grand_total.mined = grand_total.mined + mined_total;

        console.log(colors.green(`Mined for period ${mined_total.toFixed(2)} HNT`));
        console.log(colors.green(`Taxable income for period $${taxable_total.toFixed(2)}`));

        const total = {
            mined: mined_total,
            date: "TOTAL",
            price: 0,
            taxable: taxable_total
        };

        csv(_.concat([total], results), {
            header: true,
            columns: ['date', 'mined', 'price', 'taxable']
        }, function (err, data) {
            if (err) callback(err);
            fs.writeFile(`reports/${address}_${moment(START_DATE).format('YYYY-MM-DD')}_${moment(END_DATE).format('YYYY-MM-DD')}.csv`, data, function (err) {
                if (err) callback(err);

                console.log(colors.yellow(`FILE: reports/${address}_${moment(START_DATE).format('YYYY-MM-DD')}_${moment(END_DATE).format('YYYY-MM-DD')}.csv`))

                callback(err);
            });
        });
    });
}, (err) => {
    if (err) console.log(err);
    console.log(colors.red(`For ${HT_ADDRESSES} between ${START_DATE} and ${END_DATE}`));
    console.log(colors.red(`You mined ${grand_total.mined.toFixed(2)} HNT!`));
    console.log(colors.red(`Taxable income: $${grand_total.taxable.toFixed(2)}`));
})