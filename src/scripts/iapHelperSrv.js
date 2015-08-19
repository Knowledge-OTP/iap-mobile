(function (angular) {
    'use strict';

    angular.module('znk.iap').factory('InAppPurchaseHelperSrv', [
        '$q', '$rootScope', '$injector', 'ENV',
        function ($q, $rootScope, $injector, ENV) {
            var InAppPurchaseHelperSrv = {};
            var IAP_PATH = 'iap';

            InAppPurchaseHelperSrv.getProducts = function(){
                //preventing dependency ins storageSrv
                var StorageSrv = $injector.get('StorageSrv');
                return StorageSrv.get(IAP_PATH).then(function(iapObj){
                    if(!iapObj.products || !iapObj.products[ENV.firebaseAppScopeName] || !iapObj.products[ENV.firebaseAppScopeName].length){
                        console.error('Failed to retrieve products from db');
                        return $q.reject('Failed to retrieve products from db');
                    }
                    return iapObj.products[ENV.firebaseAppScopeName];
                });
            };

            InAppPurchaseHelperSrv.getUserSubscription = function(){
                //preventing dependency ins storageSrv
                var StorageSrv = $injector.get('StorageSrv');
                var SUBSCRIPTIONS_PATH = StorageSrv.globalUserSpacePath.concat(['subscriptions']);
                return StorageSrv.get(SUBSCRIPTIONS_PATH).then(function(subscriptionObj){
                    return subscriptionObj.sat ? new Date(subscriptionObj.sat) : null;
                });
            };

            InAppPurchaseHelperSrv.updateSubscription = function(date){
                if(angular.isUndefined(date)){
                    return;
                }

                return InAppPurchaseHelperSrv.getUserSubscription().then(function(subscriptionObj){
                    //preventing dependency ins storageSrv
                    var StorageSrv = $injector.get('StorageSrv');
                    var SUBSCRIPTIONS_PATH = StorageSrv.globalUserSpacePath.concat(['subscriptions']);
                    subscriptionObj.sat = date.getTime();
                    StorageSrv.set(SUBSCRIPTIONS_PATH, subscriptionObj);
                });

            };

            InAppPurchaseHelperSrv.validateReceipt = function(){
                //@todo(igor) receipt validation
                return $q.when(true);
            };

            InAppPurchaseHelperSrv.addTransaction = function(product){
                //HACK - generate random transaction id (TODO - on android returns undefined - orderId)
                var transactionId = (!product.transaction.id) ? (new Date()).getTime() : (product.transaction.id).replace('.','');

                //remove undefined prop and null for firebase
                for(var prop in product.transaction){
                    if(angular.isUndefined(product.transaction[prop]) || product.transaction[prop] === null){
                        delete product.transaction[prop];
                    }
                }

                //HACK - plugin should expose store purchase time
                product.purchaseTime = (new Date()).getTime();
                //preventing dependency ins storageSrv
                var StorageSrv = $injector.get('StorageSrv');
                var TRANSACTIONS_PATH = StorageSrv.globalUserSpacePath.concat(['transactions']);
                return StorageSrv.get(TRANSACTIONS_PATH).then(function(transactionsObj){
                    //check if transaction already exists
                    if(transactionsObj[transactionId]){
                        return $q.when(null);
                    }
                    transactionsObj[transactionId] = product;
                    StorageSrv.set(TRANSACTIONS_PATH, transactionsObj);

                    var getProductLengthProm = InAppPurchaseHelperSrv.getProductLength(product.id);
                    return getProductLengthProm.then(function(length){
                        if(!length){
                            return null;
                        }
                        //@todo(igor) security issue, date can be manipulated by the user
                        var newSubscriptionExpiryDate = new Date();
                        newSubscriptionExpiryDate.setMonth(newSubscriptionExpiryDate.getMonth() + length);
                        InAppPurchaseHelperSrv.updateSubscription(newSubscriptionExpiryDate);
                        return newSubscriptionExpiryDate;
                    });
                });
            };

            InAppPurchaseHelperSrv.getProductLength = function getProductLength(id){
                var getProductsProm = InAppPurchaseHelperSrv.getProducts();
                return getProductsProm.then(function(products){
                    for(var i in products){
                        var product = products[i];
                        //HACK - has to be fixed
                        if(product.appStoreId === id || product.playStoreUid === id){
                            return product.length;
                        }
                    }
                    return null;
                });
            };

            return InAppPurchaseHelperSrv;
        }
    ]);
})(angular);
