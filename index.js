const axios = require('axios').default;
const moment = require('moment');
const async = require('async');
const csv = require('csv-stringify')
const fs = require('fs');
const _ = require('lodash');
const colors = require('colors/safe');

const HELIUM_API = "https://api.helium.io/v1";
const HT_ADDRESSES = process.env.HT_ADDRESSES;
const START_DATE = process.env.HT_START_DATE || moment().subtract(7, 'days').format('YYYY-MM-DD');
const END_DATE = process.env.HT_END_DATE || moment().format('YYYY-MM-DD');
const MAX_DAYS = moment(END_DATE).diff(moment(START_DATE), 'days');

const miner_history = (address, callback) => {
    let results = [];
    let finished = false;
    let days = 1;

    console.log(`getting data from ${moment(START_DATE).format('YYYY-MM-DD')} to ${moment(END_DATE).format('YYYY-MM-DD')} Total: ${MAX_DAYS} Days for ${colors.bgYellow(address)}`);
    console.log(colors.bgBrightRed(`GO GRAB A COFFE! ESTIMATED TIME ${moment.duration(1*MAX_DAYS, "seconds").humanize()}`));

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async.until(function test(cb) {
        cb(null, finished)
    }, function iter(next) {
        let min_time = moment(END_DATE).subtract(days, 'days');
        let max_time = moment(END_DATE).subtract(days - 1, 'days');

        axios.get(`${HELIUM_API}/accounts/${address}/rewards/sum?min_time=${min_time.toISOString()}&max_time=${max_time.toISOString()}`)
            .then(function (resp) {
                const mined = Number(_.get(resp, 'data.data.total', 0).toFixed(2));

                axios.get(`https://api.coingecko.com/api/v3/coins/helium/history?date=${max_time.format('DD-MM-YYYY')}&localization=false`)
                    .then(function (resp) {
                        const price = Number(_.get(resp, 'data.market_data.current_price.usd', 0).toFixed(2));
                        const taxable = Number((price * mined).toFixed(2));

                        console.log(`${max_time.format('YYYY-MM-DD')} mined ${mined} HNT @ $${price} = ${colors.green('$' + taxable)}`);

                        results = results.concat({
                            mined: mined,
                            date: max_time.format('YYYY-MM-DD'),
                            price: price,
                            taxable: taxable
                        });

                        finished = MAX_DAYS == days;
                        days++;
                        sleep(500).then(() => {
                            next();
                        });

                    })
                    .catch(function (err) {
                        next(err)
                    });
            })
            .catch(function (err) {
                next(err)
            });

    }).then((err) => {
        if (err) return console.log(err);

        callback(err, results);
    });
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

        console.log(colors.bgBrightGreen(`Mined for period ${mined_total.toFixed(2)} HNT`));
        console.log(colors.bgBrightGreen(`Taxable income for period $${taxable_total.toFixed(2)}`));

        csv(results, {
            header: true,
            columns: ['date', 'mined', 'price', 'taxable']
        }, function (err, data) {
            if (err) callback(err);
            fs.writeFile(`reports/${address}_${moment(START_DATE).format('YYYY-MM-DD')}_${moment(END_DATE).format('YYYY-MM-DD')}.csv`, data, function (err) {
                if (err) callback(err);

                console.log(colors.bgYellow(`FILE: reports/${address}_${moment(START_DATE).format('YYYY-MM-DD')}_${moment(END_DATE).format('YYYY-MM-DD')}.csv`))
                
                callback(err);
            });
        });
    });
})