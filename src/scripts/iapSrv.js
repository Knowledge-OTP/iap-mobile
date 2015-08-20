(function (angular,ionic) {
    'use strict';

    angular.module('cordova-iap').provider('IapSrv', function QuestionTypesProvider() {
        var _availProductsFallback;
        this.setProductsFallback = function(availProductsFallback){
            _availProductsFallback = availProductsFallback;
        };

        this.$get = [
            '$window', '$q', '$injector', '$rootScope', '$filter', 'InAppPurchaseHelperSrv', 'ENV', '$analytics',
            function ($window, $q, $injector, $rootScope, $filter, InAppPurchaseHelperSrv, ENV, $analytics) {
                if(!_availProductsFallback){
                    console.error('fallback products were not set for iap');
                }
                var productsIdsArr = [];
                var currentStoreProducts = [];

                var _store, isOnline = !!($window.navigator && $window.navigator.onLine);
                var _storeReadyDefer = $q.defer();
                var SUBSCRIPTION_PURCHASED_EVENT = 'iap:subscribed';

                var IapSrv = {
                    _products: [],
                    SUBSCRIPTION_PURCHASED_EVENT: SUBSCRIPTION_PURCHASED_EVENT,
                    subscriptionLengthInMonth: {}
                };

                IapSrv.init = function init() {
                    var productsProm = InAppPurchaseHelperSrv.getProducts();
                    productsProm.catch(function(){
                        return _availProductsFallback;
                    }).then(function (productsArr) {
                        productsArr.forEach(function (product) {
                            var productId;
                            var productType;

                            if (ionic.Platform.isAndroid() && product.playStoreUid) {
                                productId = product.playStoreUid;
                                productType = product.playStoreType;
                            }

                            if (ionic.Platform.isIOS() && product.appStoreId) {
                                productId = product.appStoreId;
                                productType = product.appStoreType;
                            }

                            if (productId) {
                                var productAlias;

                                if (productId.indexOf('.m') > -1) {
                                    productAlias = productId.substr(productId.lastIndexOf('sub')).substr(0, productId.substr(productId.lastIndexOf('sub')).lastIndexOf('.'));
                                }
                                else {
                                    productAlias = productId.substr(productId.lastIndexOf('.') + 1);
                                }
                                productsIdsArr.push(productId);
                                currentStoreProducts.push({
                                    id: productId,
                                    type: productType,
                                    alias: productAlias
                                });
                                IapSrv.subscriptionLengthInMonth[productId] = product.length;
                            }
                        });

                        IapSrv.productIds = productsIdsArr;
                        return currentStoreProducts;
                    }).then(function (currentStoreProductsArr) {
                        _store = $window.store;

                        // Enable maximum logging level
                        _store.verbosity = ENV.debug ? _store.DEBUG : _store.QUIET;

                        // Enable remote receipt validation
                        _store.validator = function (product, callback) {
                            var validateProm = InAppPurchaseHelperSrv.validateReceipt(product.transaction.appStoreReceipt);
                            validateProm.then(function (res) {
                                callback(res);
                            });
                        };

                        //register all existing products and set purchase events
                        currentStoreProductsArr.forEach(function (product) {

                            //product is already registered
                            if (_store.get(product.alias)) {
                                return;
                            }
                            _store.register({
                                id: product.id,
                                alias: product.alias,
                                type: product.type
                            });
                        });

                        //update product in IapSrv products array
                        function updateProduct(product) {
                            var indexOfProduct = IapSrv.productIds.indexOf(product.id);
                            if (indexOfProduct !== -1) {
                                IapSrv._products[indexOfProduct] = product;
                            } else {
                                throw 'Unrecognized product id was received !!!!! ' + product.id;
                            }
                        }

                        //any product update callback
                        _store.when('product').updated(function (product) {
                            updateProduct(product);
                        });

                        // Log all errors
                        _store.error(function (error) {
                            $analytics.eventTrack('store-error', {category: 'purchase', label: error});
                            if (!_storeReadyDefer.resolve) {
                                _storeReadyDefer.reject('Store Not Available');
                            }
                        });

                        _store.ready(function () {
                            _storeReadyDefer.resolved = true;
                            _storeReadyDefer.resolve(true);
                        });
                    });
                };

                IapSrv.noStore = function (err) {
                    if (!err) {
                        err = 'No store available';
                    }
                    //@todo(igor) add offline behaviour
                    _storeReadyDefer.reject(err);
                };

                IapSrv.getSubscription = function () {
                    return InAppPurchaseHelperSrv.getUserSubscription().then(function (expiryDate) {
                        //return true;
                        if (!expiryDate) {
                            return null;
                        }

                        var currDate = new Date();
                        currDate.setDate(currDate.getDate() - 1);
                        if (currDate > expiryDate) {
                            return null;
                        } else {
                            return expiryDate;
                        }
                    });
                };

                IapSrv.purchase = function (productId) {
                    var orderDefer = $q.defer();
                    var orderProm = $window.store.order(productId);

                    function cancelledHandler(err) {
                        console.log('cancelled');
                        $analytics.eventTrack('cancel-purchase', {category: 'purchase', label: 'cancelled'});
                        orderDefer.reject(err);
                    }

                    function finishedHandler(res) {
                        console.log('finished');
                        $analytics.eventTrack('purchased', {category: 'purchase', label: 'purchased'});

                        if ($window.facebookConnectPlugin) {
                            $window.facebookConnectPlugin.logEvent('Purchased', {
                                NumItems: 1,
                                Currency: 'USD',
                                ContentType: 'zinkerzsat',
                                ContentID: productId
                            }, null, function () {
                            }, function () {
                            });
                        }

                        if ($window.plugins && $window.plugins.matPlugin) {
                            var matEvent = {
                                'name': 'purchase',
                                'revenue': 1,
                                'currency': 'USD',
                                'advertiserRefId': '182516'
                            };
                            $window.plugins.matPlugin.measureEvent(matEvent);
                        }
                        orderDefer.resolve(res);
                    }

                    //product purchase received , verification needed.
                    function approved(product) {
                        console.log('approved');
                        $analytics.eventTrack('purchase-approved', {category: 'purchase', label: 'approved'});
                        product.verify();
                    }

                    //Product purchase was verified
                    function verified(product) {
                        console.log('verified');
                        $analytics.eventTrack('purchase-verified', {category: 'purchase', label: 'verified'});
                        var addTransactionProm = InAppPurchaseHelperSrv.addTransaction(product);
                        addTransactionProm.then(function (newExpiryDate) {
                            if (!newExpiryDate) {
                                return;
                            }
                            product.finish();
                            $rootScope.$broadcast(SUBSCRIPTION_PURCHASED_EVENT, newExpiryDate);
                        });
                    }

                    //Product purchase was not verified , transaction not exists or expired
                    function unverified() {
                        console.log('unverified');
                        $analytics.eventTrack('purchase-unverified', {category: 'purchase', label: 'unverified'});
                    }

                    orderProm.then(function () {
                        $window.store.when(productId).cancelled(cancelledHandler);
                        $window.store.when(productId).finished(finishedHandler);
                        $window.store.when(productId).approved(approved);
                        $window.store.when(productId).verified(verified);
                        $window.store.when(productId).unverified(unverified);
                    });

                    orderProm.error(function (err) {
                        orderDefer.reject(err);
                    });

                    orderDefer.promise.finally(function () {
                        $window.store.off(cancelledHandler);
                        $window.store.off(finishedHandler);
                        $window.store.off(approved);
                        $window.store.off(verified);
                        $window.store.off(unverified);
                    });
                    return orderDefer.promise;
                };

                IapSrv.getProducts = function () {
                    if (!isOnline) {
                        var defer = $q.defer();
                        defer.reject('No Internet connection');
                        return defer.promise;
                    }

                    if (!IapSrv._products.length) {
                        $window.store.refresh();
                    }

                    return _storeReadyDefer.promise.then(function () {
                        return angular.copy(IapSrv._products);
                    }, function (err) {
                        throw err;
                    });
                };

                function offlineHandler() {
                    isOnline = false;
                }
                document.addEventListener('offline', offlineHandler, false);

                function onlineHandler() {
                    isOnline = true;
                }
                document.addEventListener('online', onlineHandler, false);

                return IapSrv;
            }
        ];
    });
})(angular,ionic);
