'use strict';

const Logger = require('../helper/logger.js');

class HeaterCoolerAccessory {

  constructor (api, accessory, accessories, tado, deviceHandler) {
    
    this.api = api;
    this.accessory = accessory;
    this.accessories = accessories;
    
    this.deviceHandler = deviceHandler;
    this.tado = tado;
    
    this.getService();

  }

  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
  // Services
  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

  getService () {
    
    let service = this.accessory.getService(this.api.hap.Service.HeaterCooler);
    let serviceThermostat = this.accessory.getService(this.api.hap.Service.Thermostat);
    let serviceSwitch = this.accessory.getService(this.api.hap.Service.Switch);
    let serviceFaucet = this.accessory.getService(this.api.hap.Service.Valve);
    
    if(serviceThermostat){
      Logger.info('Removing Thermostat service', this.accessory.displayName);
      this.accessory.removeService(serviceThermostat);
    }
    
    if(serviceSwitch){
      Logger.info('Removing Switch service', this.accessory.displayName);
      this.accessory.removeService(serviceSwitch);
    }
    
    if(serviceFaucet){
      Logger.info('Removing Faucet service', this.accessory.displayName);
      this.accessory.removeService(serviceFaucet);
    }
    
    if(!service){
      Logger.info('Adding HeaterCooler service', this.accessory.displayName);
      service = this.accessory.addService(this.api.hap.Service.HeaterCooler, this.accessory.displayName, this.accessory.context.config.subtype);
    }
    
    let batteryService = this.accessory.getService(this.api.hap.Service.BatteryService);
    
    if(!this.accessory.context.config.noBattery && this.accessory.context.config.type === 'HEATING'){
      if(!batteryService){
        Logger.info('Adding Battery service', this.accessory.displayName);
        batteryService = this.accessory.addService(this.api.hap.Service.BatteryService);
      }
      batteryService
        .setCharacteristic(this.api.hap.Characteristic.ChargingState, this.api.hap.Characteristic.ChargingState.NOT_CHARGEABLE);          
    } else {
      if(batteryService){
        Logger.info('Removing Battery service', this.accessory.displayName);
        this.accessory.removeService(batteryService);
      }
    }
    
    //Handle DelaySwitch
    if(this.accessory.context.config.delaySwitch && this.accessory.context.config.type !== 'HOT_WATER'){
   
      if(!service.testCharacteristic(this.api.hap.Characteristic.DelaySwitch))
        service.addCharacteristic(this.api.hap.Characteristic.DelaySwitch);
        
      if(!service.testCharacteristic(this.api.hap.Characteristic.DelayTimer))
        service.addCharacteristic(this.api.hap.Characteristic.DelayTimer);
   
      service.getCharacteristic(this.api.hap.Characteristic.DelaySwitch)
        .onGet(() => {
          return this.accessory.context.delaySwitch || false;
        })
        .onSet(value => {
          this.accessory.context.delaySwitch = value;
        });
        
      service.getCharacteristic(this.api.hap.Characteristic.DelayTimer)
        .onGet(() => {
          return this.accessory.context.delayTimer || 0;
        })
        .onSet(value => {
          this.accessory.context.delayTimer = value;
        });
   
    } else {
   
      if(service.testCharacteristic(this.api.hap.Characteristic.DelaySwitch))
        service.removeCharacteristic(service.getCharacteristic(this.api.hap.Characteristic.DelaySwitch));
        
      if(service.testCharacteristic(this.api.hap.Characteristic.DelayTimer))
        service.removeCharacteristic(service.getCharacteristic(this.api.hap.Characteristic.DelayTimer));
   
    }
    
    if (!service.testCharacteristic(this.api.hap.Characteristic.HeatingThresholdTemperature))
      service.addCharacteristic(this.api.hap.Characteristic.HeatingThresholdTemperature);
    
    if (!service.testCharacteristic(this.api.hap.Characteristic.CoolingThresholdTemperature) && this.accessory.context.config.type === 'HEATING')
      service.addCharacteristic(this.api.hap.Characteristic.CoolingThresholdTemperature);
    
    let minValue = this.accessory.context.config.type === 'HOT_WATER'
      ? this.accessory.context.config.temperatureUnit === 'CELSIUS'
        ? 30
        : 86
      : this.accessory.context.config.temperatureUnit === 'CELSIUS'
        ? 5
        : 41;
        
    let maxValue = this.accessory.context.config.type === 'HOT_WATER'
      ? this.accessory.context.config.temperatureUnit === 'CELSIUS'
        ? 65
        : 149
      : this.accessory.context.config.temperatureUnit === 'CELSIUS'
        ? 25
        : 77;
    
    let props = {
      maxValue: 3,      
      minValue: 0,        
      validValues: [0, 1, 2, 3]
    };
    
    if(this.accessory.context.config.type === 'HOT_WATER'){
      props = {
        maxValue: 2,      
        minValue: 2,        
        validValues: [2]
      };
      service.getCharacteristic(this.api.hap.Characteristic.CurrentHeaterCoolerState)
        .updateValue(2);
    }
    
    service.getCharacteristic(this.api.hap.Characteristic.TargetHeaterCoolerState)
      .updateValue(1);
    
    service.getCharacteristic(this.api.hap.Characteristic.CurrentHeaterCoolerState)
      .setProps(props);
    
    service.getCharacteristic(this.api.hap.Characteristic.TargetHeaterCoolerState)
      .setProps({
        maxValue: 1,
        minValue: 1,        
        validValues: [1]
      });
      
    service.getCharacteristic(this.api.hap.Characteristic.CurrentTemperature)
      .setProps({
        minValue: -255,
        maxValue: 255
      });
      
    if(this.accessory.context.config.type === 'HEATING'){
    
      service.getCharacteristic(this.api.hap.Characteristic.CoolingThresholdTemperature)
        .setProps({
          minValue: minValue,
          maxValue: maxValue
        });
        
      if (!service.getCharacteristic(this.api.hap.Characteristic.CoolingThresholdTemperature).value < minValue)
        service.getCharacteristic(this.api.hap.Characteristic.CoolingThresholdTemperature)
          .updateValue(minValue);
          
      if (!service.getCharacteristic(this.api.hap.Characteristic.CoolingThresholdTemperature).value < maxValue)
        service.getCharacteristic(this.api.hap.Characteristic.CoolingThresholdTemperature)
          .updateValue(maxValue);
    
    }
      
    service.getCharacteristic(this.api.hap.Characteristic.HeatingThresholdTemperature)
      .setProps({
        minValue: minValue,
        maxValue: maxValue
      });
      
    if (!service.getCharacteristic(this.api.hap.Characteristic.HeatingThresholdTemperature).value < minValue)
      service.getCharacteristic(this.api.hap.Characteristic.HeatingThresholdTemperature)
        .updateValue(minValue);
        
    if (!service.getCharacteristic(this.api.hap.Characteristic.HeatingThresholdTemperature).value < maxValue)
      service.getCharacteristic(this.api.hap.Characteristic.HeatingThresholdTemperature)
        .updateValue(maxValue);
    
    service.getCharacteristic(this.api.hap.Characteristic.Active)
      .onSet(value => {
        
        if(this.waitForEndValue){
          clearTimeout(this.waitForEndValue);
          this.waitForEndValue = null;
        }
        
        this.waitForEndValue = setTimeout(() => {
          
          this.deviceHandler.setStates(this.accessory, this.accessories, 'State', value);
          
        }, 500);

      });
      
    service.getCharacteristic(this.api.hap.Characteristic.HeatingThresholdTemperature)
      .onSet(value => {
        
        if(this.waitForEndValue){
          clearTimeout(this.waitForEndValue);
          this.waitForEndValue = null;
        }
        
        this.waitForEndValue = setTimeout(() => {
          
          this.deviceHandler.setStates(this.accessory, this.accessories, 'Temperature', value);
          
        }, 250);
      
      });
    
  }

}

module.exports = HeaterCoolerAccessory;