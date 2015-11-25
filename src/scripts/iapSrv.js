(function (angular) {
    'use strict';

    angular.module('znk.iap').provider('IapSrv',[function () {
        
        var productsGetter;
        var validatorFuncRef;
        // var _availProductsFallback;
        var enableNoStoreMode;
        // this.setProductsFallback = function(availProductsFallback){
        //     _availProductsFallback = availProductsFallback;
        // };
        var enableRecipetValidation=false;
        var validationUrl;

        this.registerProducts = function(fnOrArr){
            productsGetter = fnOrArr;
        };

        this.setValidator = function(func){
            validatorFuncRef = func;
        };
        
        this.setNoStoreMode = function(shouldEnableNoStoreMode){
            enableNoStoreMode = shouldEnableNoStoreMode;
            console.log('IAP EnableNoStoreMode: ' + enableNoStoreMode);
        };

        this.setEnableRecipetValidation = function(shouldEnableRecipetValidation){
            enableRecipetValidation = shouldEnableRecipetValidation;
        };

        this.setValidationUrl = function(url){
            validationUrl = url;
        };

        this.$get = [
            '$window', '$q', '$injector', '$filter', 'InAppPurchaseHelperSrv', 'ENV', '$analytics','$ionicLoading','$ionicPopup','$document','$timeout', '$http',
            function ($window, $q, $injector, $filter, InAppPurchaseHelperSrv, ENV, $analytics, $ionicLoading, $ionicPopup, $document, $timeout, $http) {
                
                var isWeb = !$window.cordova;
                var iapStoreReadyDfd = $q.defer();
                var iapStoreReadyProm = iapStoreReadyDfd.promise;
                var iapStoreTimedOut = false;
                var iapStoreReadyTimeout = $timeout(function(){
                    iapStoreTimedOut = true;
                    if (angular.isDefined(iapStoreReadyDfd)){
                        iapStoreReadyDfd.reject('store timeout');
                    }
                },10000);
                if (enableNoStoreMode || isWeb){
                    if(!iapStoreTimedOut){
                        $timeout.cancel(iapStoreReadyTimeout);
                        iapStoreReadyDfd.resolve();
                    }
                }
                var isOnline = !!($window.navigator && $window.navigator.onLine);
                var validatorFunc;
                
                var extendedProductMock = {
                    transaction: {
                        id:'demo'
                    },
                    price: '$30.99',
                    title: 'buy'
                };
                var PlatfromEnum = {
                    IOS: 0,
                    ANDROID: 1,
                    UNKNOWN: 2
                };
                
                var iapSrv = {
                    initializedStore: false,
                    //store products, updated only by store update event handelr
                    products: {},
                    //application products (not store products)
                    appProductsArr: [],
                    //loadingError: false,
                    // isShowingModal: false,
                    // currentErrorPopup: undefined,
                    isPurchaseInProgress: false,
                    purchaseInProgressDfd: undefined,
                    IapErrorCodeEnum: {
                          CANCELLED: 0,
                          FAILED: 1,
                          VALIDATOR_FALSE: 2,
                          VALIDATOR_ERROR: 3,
                          VALIDATOR_NO_TRANSACTION: 4,
                          RECIPT_NOT_APPROVED: 5
                    }
                };

                // function _setUndefinedPropertiesToNull(obj, deepCleanup) {
                //     for (var property in obj) {
                //         if (obj.hasOwnProperty(property)) {
                //             if (deepCleanup && typeof obj[property] === 'object'){
                //                 _setUndefinedPropertiesToNull(obj[property]);
                //             }
                //             else{
                //                 if (angular.isUndefined(obj[property])){
                //                     console.log('property is undefined, property=' + property);
                //                     obj[property] = null;
                //                 }
                //             }
                //         }
                //     }
                //     return obj;
                // }

                function _verifyReciept(transaction){

                    var platform = _getPlatform(transaction.type);
                    var transactionData;
                    if (platform === PlatfromEnum.UNKNOWN){
                        return $q.reject('unknown platform');
                    }
                    else{

                        switch(platform){
                            case 'apple':
                                transactionData = {
                                    'appleReceipt' : transaction.appStoreReceipt
                                };
                                break;
                            case 'google':
                                transactionData = {
                                    'signature' : transaction.signature,
                                    'receiptData' : transaction.receipt
                                };
                                break;
                        }

                        return $http.post(validationUrl+'verify/'+ platform, transactionData).then(function(res) {
                           return res;
                        }, function(error) {
                               return $q.reject(error);
                        });
                    }
                }

                function _getValidatorFunc(){
                    if (!validatorFunc){
                        validatorFunc = $injector.invoke(validatorFuncRef);
                    }
                    return validatorFunc;
                }

                function _getAppProducts(){
                    console.log('_getAppProducts');
                    return $injector.invoke(productsGetter);
                }

                iapSrv.getAppProduct = function(productId){
                    for (var i = 0; i < iapSrv.appProductsArr.length; i++) { 
                        if (iapSrv.appProductsArr[i].id === productId){
                            return iapSrv.appProductsArr[i];
                        }
                    }
                };

                iapSrv.getStoreProduct = function(productId){
                    return iapStoreReadyProm.then(function(){
                        return iapSrv.products[productId];    
                    });
                };

                iapSrv.getStoreProducts = function(){
                    return iapStoreReadyProm.then(function(){
                        var storeProductsArr = [];
                        // if (!isOnline) {
                        //     return $q.reject('No Internet connection');                        
                        // }

                        if (enableNoStoreMode || isWeb){
                            iapSrv.appProductsArr.forEach(function (appProduct){
                                var mockProductForWeb = {};
                                extendedProductMock.title = appProduct.id.replace('com.zinkerz.zinkerztoefl.','');
                                angular.extend(mockProductForWeb, appProduct, extendedProductMock);
                                storeProductsArr.push(angular.copy(mockProductForWeb));
                            });
                        }
                        else{
                            for(var propertyName in iapSrv.products) {
                                storeProductsArr.push(angular.copy(iapSrv.products[propertyName]));
                            }
                        }
                        return storeProductsArr;
                    });
                };

                iapSrv.getIapStoreReadyPromise = function(){
                    return iapStoreReadyProm;
                };
                
                iapSrv.purchase = function(productId){

                    console.log('starting purchase');

                    return iapStoreReadyProm.then(function(){
                        console.log('purchase: isPurchaseInProgress=' + iapSrv.isPurchaseInProgress);
                        if (iapSrv.isPurchaseInProgress){
                            console.log('purchase is already in progress');
                            return $q.reject(false);
                        }
                        iapSrv.isPurchaseInProgress = true;
                        iapSrv.purchaseInProgressDfd = $q.defer();
                        $ionicLoading.show({
                            template: 'Purchase is in progress...'
                        });

                        if (enableNoStoreMode || isWeb){
                            var validator = _getValidatorFunc();
                            var mockProductForWeb = {};
                            var appProduct = iapSrv.getAppProduct(productId);

                            angular.extend(mockProductForWeb, appProduct, extendedProductMock);

                            validator(mockProductForWeb).then(function(res){
                                if (res){
                                    console.log('mock purchase completed');
                                    iapSrv.purchaseInProgressDfd.resolve(appProduct);
                                    iapSrv.isPurchaseInProgress = false;
                                    $ionicLoading.hide();
                                    console.log('purchase: isPurchaseInProgress=' + iapSrv.isPurchaseInProgress);
                                }
                                else{
                                    console.log('error in validating mock purchase');
                                    iapSrv.purchaseInProgressDfd.reject();
                                    iapSrv.isPurchaseInProgress = false;
                                    $ionicLoading.hide();
                                    console.log('purchase: isPurchaseInProgress=' + iapSrv.isPurchaseInProgress);
                                }
                            })
                            .catch(function(err){
                                console.log('error in mock purchase, err: ' + err);
                                iapSrv.purchaseInProgressDfd.reject(err);
                                iapSrv.isPurchaseInProgress = false;
                                $ionicLoading.hide();
                                console.log('purchase: isPurchaseInProgress=' + iapSrv.isPurchaseInProgress);
                            });
                            return iapSrv.purchaseInProgressDfd.promise;
                        }
                        
                        // iapSrv.isShowingModal=true;
                        var product = iapSrv.products[productId];

                        if (product){
                            $window.store.order(product.id).error(function(err){
                                console.log('error in purchase, store.order, err:' + err);
                                iapSrv.purchaseInProgressDfd.reject(err);
                                iapSrv.isPurchaseInProgress = false;
                                $ionicLoading.hide();
                                console.log('purchase: isPurchaseInProgress=' + iapSrv.isPurchaseInProgress);
                                
                                // if (iapSrv.currentErrorPopup){
                                //     iapSrv.currentErrorPopup.close();
                                // }

                                // iapSrv.currentErrorPopup.then(function(){
                                //     iapSrv.currentErrorPopup = undefined;
                                // });
                            });
                        }
                        else{
                            // if (iapSrv.currentErrorPopup){
                            //     iapSrv.currentErrorPopup.close();
                            // }

                            // iapSrv.currentErrorPopup.then(function(){
                            //     iapSrv.currentErrorPopup = undefined;
                            // }); 
                            console.log('error in purchase, no product');
                            iapSrv.purchaseInProgressDfd.reject();
                            iapSrv.isPurchaseInProgress = false;
                            $ionicLoading.hide();
                            console.log('purchase: isPurchaseInProgress=' + iapSrv.isPurchaseInProgress);
                        }
                        return iapSrv.purchaseInProgressDfd.promise;
                    });
                };

                //TODO - protect by promise, two simaltonasily will crash the app
                // iapSrv.refreshStore = function refreshStore(){

                //     if (InAppPurchaseHelperSrv.canUpgrade()){
                //         console.log('refresh store initiated');
                //         if (!iapSrv.initializedStore){
                //             iapSrv.initStore();
                //         }
                //         else{
                //             $window.store.refresh();
                //         }
                //     }
                //     else{
                //         console.log('user cannot upgrade at this time');
                //     }
                // };

                function initAppProductsForStore(){
                    console.log('init app products for the store');
                    return _getAppProducts();
                }

                function _getPlatform(transactionType) {
                    switch (transactionType) {
                        case 'ios-appstore':
                            return 'apple';
                        case 'android-playstore':
                            return 'google';
                        default:
                            return PlatfromEnum.UNKNOWN;
                    }
                }

                /////////////////////////////
                /////////////////////////////
                // initStore
                /////////////////////////////
                /////////////////////////////
                iapSrv.initStore = function(){

                    if (enableNoStoreMode || isWeb){
                        initAppProductsForStore().then(function(appProductsArr){
                            if (angular.isArray(appProductsArr) && appProductsArr.length>0){
                                iapSrv.appProductsArr = appProductsArr;
                                console.log('app products loaded');
                            }
                            else{
                                console.error('failed to load app products');
                            }
                        })
                        .catch(function(err) {
                            console.error('failed to load app products, err:' + err);
                        });
                        return;
                    }
                    
                    if (!$window.store){
                        console.log('store is not available');
                        if (angular.isDefined(iapStoreReadyDfd)){
                            if (!iapStoreTimedOut){
                               iapStoreReadyDfd.reject(); 
                            }
                        }
                        // iapSrv.loadingError = true;
                        return;
                    }
                    else{
                        console.log('initializing store');
                    }

                    if (enableRecipetValidation){
                        if (!angular.isString(validationUrl) ||  validationUrl.length===0){
                            if (!iapStoreTimedOut){
                               iapStoreReadyDfd.reject(); 
                            }

                        }
                    }

                    var initAppProductsForStoreProm = initAppProductsForStore();
                    initAppProductsForStoreProm.catch(function(err) {
                        console.error('failed to load app products, err:' + err);
                        if (angular.isDefined(iapStoreReadyDfd)){
                            if (!iapStoreTimedOut){
                                iapStoreReadyDfd.reject(err);
                            }
                        }
                        // iapSrv.loadingError = true;
                        return;
                    });
                    initAppProductsForStoreProm.then(function(appProductsArr){

                        if (angular.isArray(appProductsArr) && appProductsArr.length>0){
                            iapSrv.appProductsArr = appProductsArr;
                            console.log('app products loaded');
                        }
                        else{
                            console.error('failed to load app products');
                            if (angular.isDefined(iapStoreReadyDfd)){
                                if (!iapStoreTimedOut){
                                    iapStoreReadyDfd.reject();
                                }
                            }
                            return;
                        }

                        if (!iapSrv.initializedStore){
                            //TODO
                            iapSrv.initializedStore = true;

                            $window.store.verbosity = false ? $window.store.DEBUG : $window.store.QUIET;

                            /////////////////////////////
                            /////////////////////////////
                            //store.validator
                            /////////////////////////////
                            /////////////////////////////
                            
                            $window.store.validator = function(product, callback){

                                console.log('performing validator');
                                var verifyRecieptProm;
                                
                                if (product.transaction){
                                    console.log('new transaction, transaction:' + JSON.stringify(product.transaction));
                                    
                                    if (enableRecipetValidation){
                                        console.log('enableRecipetValidation is true');
                                        verifyRecieptProm = _verifyReciept(product.transaction);
                                    }
                                    else{
                                        verifyRecieptProm = $q.when(true);
                                    }

                                    verifyRecieptProm.then(function(res){
                                        console.log('verifyRecieptProm returned ' + res);
                                        if (res){
                                            callback(true,product);
                                        }
                                        else{
                                            // console.error('store recipt no validation');
                                            // if (angular.isDefined(iapSrv.purchaseInProgressDfd)){
                                            //     iapSrv.purchaseInProgressDfd.reject();
                                            // }
                                            // iapSrv.isPurchaseInProgress = false;
                                            // $ionicLoading.hide();
                                            // console.log('purchase: isPurchaseInProgress=' + iapSrv.isPurchaseInProgress);
                                            callback(false, {error: { code: iapSrv.IapErrorCodeEnum.RECIPT_NOT_APPROVED , message: 'recipt not approved' }});
                                        }
                                    })
                                    .catch(function(err){
                                        // console.error('error in store validator: ' + err);
                                        // if (angular.isDefined(iapSrv.purchaseInProgressDfd)){
                                        //     iapSrv.purchaseInProgressDfd.reject(err);
                                        // }
                                        // iapSrv.isPurchaseInProgress = false;
                                        // $ionicLoading.hide();
                                        // console.log('purchase: isPurchaseInProgress=' + iapSrv.isPurchaseInProgress);
                                        callback(false, {error: { code: iapSrv.IapErrorCodeEnum.VALIDATOR_ERROR , message: err }});
                                    });                                    
                                }
                                else{
                                    // console.log('no transaction');
                                    // if (angular.isDefined(iapSrv.purchaseInProgressDfd)){
                                    //     iapSrv.purchaseInProgressDfd.reject();
                                    // }
                                    // iapSrv.isPurchaseInProgress = false;
                                    // $ionicLoading.hide();
                                    // console.log('purchase: isPurchaseInProgress=' + iapSrv.isPurchaseInProgress);
                                    callback(false, {error: { code: iapSrv.IapErrorCodeEnum.VALIDATOR_NO_TRANSACTION , message: 'no transaction' }});
                                }
                            };

                            /////////////////////////////
                            /////////////////////////////
                            // Register App products
                            /////////////////////////////
                            /////////////////////////////

                            iapSrv.appProductsArr.forEach(function (appProduct){

                                console.log('registering product: ' + JSON.stringify(appProduct));
                                $window.store.register({
                                    id: appProduct.id,
                                    alias: appProduct.alias,
                                    type: appProduct.type
                                });
                            });

                            /////////////////////////////
                            /////////////////////////////
                            // purchaseApproved
                            /////////////////////////////
                            /////////////////////////////

                            var purchaseApproved = function purchaseApproved(product){
                                console.log('purchase approved');
                                $analytics.eventTrack('purchase-approved', {category: 'purchase', label: 'approved'});
                                product.verify();
                            };

                            /////////////////////////////
                            /////////////////////////////
                            // Approved App products Handler
                            /////////////////////////////
                            /////////////////////////////

                            iapSrv.appProductsArr.forEach(function (appProduct) {
                                $window.store.when(appProduct.id).approved(function(product){
                                    purchaseApproved(product);
                                });
                            });

                            /////////////////////////////
                            /////////////////////////////
                            // Verified App products Handler
                            /////////////////////////////
                            /////////////////////////////

                            iapSrv.appProductsArr.forEach(function (appProduct) {
                                $window.store.when(appProduct.id).verified(function(product){
                                    console.log('purchase verified');
                                    var validator = _getValidatorFunc();
                                    if (!angular.isFunction(validator)){
                                        console.error('_getValidatorFunc returned no function');
                                        if (angular.isDefined(iapSrv.purchaseInProgressDfd)){
                                            iapSrv.purchaseInProgressDfd.reject(false);
                                        }
                                        iapSrv.isPurchaseInProgress = false;
                                        $ionicLoading.hide();
                                        console.log('purchase: isPurchaseInProgress=' + iapSrv.isPurchaseInProgress);
                                    }
                                    else{
                                        //TODO - CHECK IOS AND ANDROID TRANSACTIONS DATA
                                        // if (angular.isDefined(product.transaction.orderId)){
                                        // }

                                        // var cleanProduct = _setUndefinedPropertiesToNull(angular.copy(product),true);
                                        validator(product).then(function(res){
                                            $ionicLoading.hide();
                                            if (res){
                                                console.log('app validator returned true');
                                                if (angular.isDefined(iapSrv.purchaseInProgressDfd)){
                                                    iapSrv.purchaseInProgressDfd.resolve(product);
                                                }
                                                iapSrv.isPurchaseInProgress = false;
                                                $ionicLoading.hide();
                                                console.log('purchase: isPurchaseInProgress=' + iapSrv.isPurchaseInProgress);
                                                product.finish();
                                            }
                                            else{
                                                console.error('app validator returned false');
                                                if (angular.isDefined(iapSrv.purchaseInProgressDfd)){
                                                    iapSrv.purchaseInProgressDfd.reject(false);
                                                }
                                                iapSrv.isPurchaseInProgress = false;
                                                $ionicLoading.hide();
                                                console.log('purchase: isPurchaseInProgress=' + iapSrv.isPurchaseInProgress);
                                            }
                                        }).catch(function(err){
                                            console.error('error in app validator: ' + err);
                                            if (angular.isDefined(iapSrv.purchaseInProgressDfd)){
                                                iapSrv.purchaseInProgressDfd.reject(err);
                                            }
                                            iapSrv.isPurchaseInProgress = false;
                                            $ionicLoading.hide();
                                            console.log('purchase: isPurchaseInProgress=' + iapSrv.isPurchaseInProgress);
                                        });
                                    }
                                });
                            });

                            /////////////////////////////
                            /////////////////////////////
                            // Unverified App products Handler
                            /////////////////////////////
                            /////////////////////////////

                            iapSrv.appProductsArr.forEach(function (appProduct) {
                                $window.store.when(appProduct.id).unverified(function(){
                                    console.log('purchase unverified');
                                    console.error('store recipt no validated');
                                    if (angular.isDefined(iapSrv.purchaseInProgressDfd)){
                                        iapSrv.purchaseInProgressDfd.reject();
                                    }
                                    iapSrv.isPurchaseInProgress = false;
                                    $ionicLoading.hide();
                                    console.log('purchase: isPurchaseInProgress=' + iapSrv.isPurchaseInProgress);
                                            
                                });
                            });

                            /////////////////////////////
                            /////////////////////////////
                            // Initiated App products Handler
                            /////////////////////////////
                            /////////////////////////////

                            iapSrv.appProductsArr.forEach(function (appProduct) {
                                $window.store.when(appProduct.id).initiated(function(){
                                    console.log('purchase initiated...');                              
                                });
                            });

                            /////////////////////////////
                            /////////////////////////////
                            // purchaseCancelled
                            /////////////////////////////
                            /////////////////////////////

                            var purchaseCancelled = function purchaseCancelled(){
                                console.log('purchase cancelled');
                                if (angular.isDefined(iapSrv.purchaseInProgressDfd)){
                                    iapSrv.purchaseInProgressDfd.reject({code:iapSrv.IapErrorCodeEnum.CANCELLED,  message: 'purchase cancelled'});
                                }
                                iapSrv.isPurchaseInProgress = false;
                                $ionicLoading.hide();
                                console.log('purchase: isPurchaseInProgress=' + iapSrv.isPurchaseInProgress);
                            };
                            
                            /////////////////////////////
                            /////////////////////////////
                            // Cancelled and Refunded App products Handler
                            /////////////////////////////
                            /////////////////////////////

                            iapSrv.appProductsArr.forEach(function (appProduct){
                                $window.store.when(appProduct.id).cancelled(function(product){
                                    purchaseCancelled(product);                               
                                });
                                $window.store.when(appProduct.id).refunded(function(product){
                                    console.log('purchase refunded, product:' + product.id);                               
                                });
                            });

                            /////////////////////////////
                            /////////////////////////////
                            // Updated and Finished App products Handler
                            /////////////////////////////
                            /////////////////////////////

                            $window.store.ready(function(){
                                console.log('-----store is ready-----');
                                if(!iapStoreTimedOut){
                                    $timeout.cancel(iapStoreReadyTimeout);
                                    if (angular.isDefined(iapStoreReadyDfd)){
                                        iapStoreReadyDfd.resolve();
                                    }
                                    
                                }
                            }); 

                            iapSrv.appProductsArr.forEach(function (appProduct){
                                $window.store.when(appProduct.id).updated(function(product){
                                    console.log('product updated: ' + product.id);
                                    iapSrv.products[product.id] = product;
                                });
                                $window.store.when(appProduct.id).finished(function(product){
                                    console.log('product finished: ' + product.id);
                                });
                            });

                            /////////////////////////////
                            /////////////////////////////
                            // Store error
                            /////////////////////////////
                            /////////////////////////////

                            $window.store.error(function(err){
                                console.log('store error ' + err.code + ': ' + err.message);
                                console.log('purchase: isPurchaseInProgress=' + iapSrv.isPurchaseInProgress);
                                
                                if (angular.isDefined(iapSrv.purchaseInProgressDfd)){
                                    iapSrv.purchaseInProgressDfd.reject(err);
                                }
                                iapSrv.isPurchaseInProgress = false;
                                $ionicLoading.hide();
                                console.log('purchase: isPurchaseInProgress=' + iapSrv.isPurchaseInProgress);
                            
                                if (angular.isDefined(iapStoreReadyDfd)){
                                    if (!iapStoreTimedOut){
                                        iapStoreReadyDfd.reject(err);
                                    }
                                }
                                // console.log('isShowingModal: ' + iapSrv.isShowingModal);

                                // if (err.code !== $window.store.ERR_PURCHASE && iapSrv.isShowingModal){
                                //     iapSrv.loadingError = true;

                                //     // if (!iapSrv.currentErrorPopup){
                                //     //     iapSrv.currentErrorPopup = $ionicPopup.alert({
                                //     //         title: 'Error',
                                //     //         template: 'There was an error with the store. Please try again later.',
                                //     //         okText: 'OK',
                                //     //         okType: 'button-default'
                                //     //     });
                                //     //     iapSrv.currentErrorPopup.then(function(){
                                //     //         iapSrv.currentErrorPopup = undefined;
                                //     //     });
                                //     // }
                                // }

                                // if (err.code && iapSrv.isShowingModal){
                                //     iapSrv.loadingError = true;

                                //     if (!iapSrv.currentErrorPopup){
                                //         iapSrv.currentErrorPopup = $ionicPopup.alert({
                                //             title: 'Error',
                                //             template: 'There was an error with the store. Please try again later.',
                                //             okText: 'OK',
                                //             okType: 'button-default'
                                //         });
                                //         iapSrv.currentErrorPopup.then(function(){
                                //             iapSrv.currentErrorPopup = undefined;
                                //         });
                                //     }
                                // }
                            });
                           $window.store.refresh();
                        }
                    })
                    .catch(function(err){
                        if (angular.isDefined(iapStoreReadyDfd)){
                            if (!iapStoreTimedOut){
                                iapStoreReadyDfd.reject(err);
                            }
                        }
                        console.error('failed to init store products, err=' + err);
                    });

                };

                function offlineHandler() {
                    console.log('not online');
                    isOnline = false;
                }
                document.addEventListener('offline', offlineHandler, false);

                function onlineHandler() {
                    console.log('online');
                    isOnline = true;
                }
                document.addEventListener('online', onlineHandler, false);

                $timeout(function(){
                    iapSrv.initStore();
                },0);

                return iapSrv;
            }
        ];




    }]);
})(angular);