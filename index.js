'use strict';

const AWS = require("aws-sdk");
AWS.config.update({region: "us-west-2"});
const docClient = new AWS.DynamoDB.DocumentClient();
const fetch = require("node-fetch");

let environment = process.env.NODE_ENV;

exports.httphandler = (event, context, callback) => {
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
};



exports.handler = (event, context, callback) => {
    console.log("Event data", event);
    getProducts(event.Items, event.CountryCode, callback);
};


const getProduct = function(sku, countryCode, callback) {
    console.log("Retrieveing PRoduct Pricing" + sku +",  " + countryCode);

    docClient.get({
        TableName: 'Products',
        Key: {SKU: sku, CountryCode: countryCode}
    },  function(err, data) {
        if(err){
            console.log("Error Retrieveing Product Pricing", data);
        }else{
            console.log("no error:", data);
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
        }
    });
};

const getProducts = function(skus, CountryCode, callback){
    console.log("Got the products");
    let keys = [];
    skus.forEach(function(item){
        keys.push({SKU:item.SKU, CountryCode});
    });
    console.log("Got the keys", keys);

    return docClient.batchGet({ RequestItems: {Products: { Keys: keys,} }},  function(err, data) {
        callback(err, data.Responses.Products);
    });
};


const loadSKU = function (sku, countryCode, callback) {
    let body = {"CountryCode":countryCode,"Item":[{"SKU":sku}]};

    console.log("looking up product", sku);
    fetch('https://www.nuskin.com/sales/api/v2/product/status?filter=,pricing', {
        method: 'POST',
        body: JSON.stringify(body),
        headers: {
            'Content-Type': 'application/json',
            'client_id': '735b1eb810304bba966af0891ab54053',  //environment.client_id
            'client_secret': '0deea37049e84157A406C0C01D29F300' //environment.client_secret
        },
    })
        .then((response) => {
            if (response.ok) {
                return response;
            }
            return Promise.reject(new Error(
                `Failed to fetch ${response.url}: ${response.status} ${response.statusText}`));
        })
        .then(response => response.json())
        .then((json) => {
                const product = json.productStatus[0];
                console.log("response form fetch", product);
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