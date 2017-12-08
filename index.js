'use strict';

const AWS = require("aws-sdk");
AWS.config.update({region: "us-west-2"});
const docClient = new AWS.DynamoDB.DocumentClient();
const fetch = require("node-fetch");




exports.handler = (event, context, callback) => {
    let sku = event['pathParameters']['SKU'];
    let countryCode = event['pathParameters']['CountryCode']
    ;
    const done = (err, res) => callback(null, {
        statusCode: err ? '400' : '200',
        body: err ? err.message : JSON.stringify(res),
        headers: {
            'Content-Type': 'application/json',
        },
    });
    getProduct(sku, countryCode, done);
}






const getProduct = function(sku, countryCode, callback) {
    docClient.get({
        TableName: 'Products',
        Key: {SKU: sku, CountryCode: countryCode}
    },  function(err, data) {
        if(!data.Item){
            loadSKU(sku, countryCode, function(err, data){
                if(!err){
                    getProduct(sku, countryCode, callback)
                }else{
                    callback(err, data); //error loading SKU from SAP
                }
            });
        }else{
            callback(err, data.Item);
        }
    });
};


const loadSKU = function (sku, countryCode, callback) {
    let body = {"CountryCode":countryCode,"Item":[{"SKU":sku}]};
    fetch('https://www.nuskin.com/sales/api/v2/product/status?filter=,pricing', {
        method: 'POST',
        body: JSON.stringify(body),
        headers: {
            'Content-Type': 'application/json',
            'client_id': '735b1eb810304bba966af0891ab54053',
            'client_secret': '0deea37049e84157A406C0C01D29F300'
        },
    })
        .then((response) => {
            if (response.ok) {
                return response;
            }
            return Promise.reject(new Error(
                `Failed to fetch ${response.url}: ${response.status} ${response.statusText}`));
        })
        .then(response => response.buffer())
        .then((buffer) => {

                const product = JSON.parse(buffer).productStatus[0];
                docClient.put({
                    TableName: 'Products',
                    Item: {
                        SKU: sku,
                        CountryCode: countryCode,
                        price: {
                            retail: product.price.WRTL,
                            wholesale: product.price.WWHL,
                            psv: product.psv.WWHL,
                            csv: product.csv.WWHL
                        },
                        taxbase: product.price.RTL,
                        timestamp: Date.now()
                    }
                }, function (err, data) {
                    if (err) {
                        console.error("Unable to add item. Error JSON:", JSON.stringify(err, null, 2));
                    } else {
                        console.log("Added item:", JSON.stringify(data, null, 2));
                        callback(err, data);
                    }
                });
            }
        )
};