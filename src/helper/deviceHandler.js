'use strict';

const Logger = require('../helper/logger.js');

const moment = require('moment');

var settingState = false;
var delayTimer = {};

module.exports = (api, accessories, config, tado, telegram) => {

  async function setStates(accessory, accs, target, value){
  
    accessories = accs.filter(acc => acc && acc.context.config.homeName === config.homeName);
  
    try {
    
      settingState = true;
    
      Logger.info(target + ': ' + value, accessory.displayName);  
    
      switch (accessory.context.config.subtype) {
        case 'zone-thermostat':
        case 'zone-heatercooler':
        case 'zone-heatercooler-boiler': {
          
          let power, temp, clear;
          
          let service = accessory.getService(api.hap.Service.HeaterCooler) || accessory.getService(api.hap.Service.Thermostat);
              
          let targetTempCharacteristic = accessory.getService(api.hap.Service.HeaterCooler)
            ? api.hap.Characteristic.HeatingThresholdTemperature
            : api.hap.Characteristic.TargetTemperature;
          
          if(accessory.context.config.subtype !== 'zone-heatercooler-boiler' && accessory.context.config.delaySwitch && accessory.context.delaySwitch && accessory.context.delayTimer && value < 5){
            
            if(value === 0){
              
              if(delayTimer[accessory.displayName]){
                Logger.info('Resetting delay timer', accessory.displayName);
                clearTimeout(delayTimer[accessory.displayName]);
                delayTimer[accessory.displayName] = null;
              }
              
              power = 'OFF';
              temp = service
                .getCharacteristic(targetTempCharacteristic)
                .value;
              
              await tado.setZoneOverlay(config.homeId, accessory.context.config.zoneId, power, temp, accessory.context.config.mode, accessory.context.config.temperatureUnit)
              
            } else {
              
              let timer = accessory.context.delayTimer;
              let tarState = value === 1
                ? 'HEAT'
                : 'AUTO';
              
              if(delayTimer[accessory.displayName]){
                clearTimeout(delayTimer[accessory.displayName]);
                delayTimer[accessory.displayName] = null;
              }
              
              Logger.info('Wait ' + timer + ' seconds before switching state', accessory.displayName);
              
              delayTimer[accessory.displayName] = setTimeout(async () => {
                
                Logger.info('Delay timer finished, switching state to ' + tarState, accessory.displayName);
                
                //targetState
                clear = value === 3;
                power = 'ON';
                temp = service
                  .getCharacteristic(targetTempCharacteristic)
                  .value;
                
                if(clear){
                  await tado.clearZoneOverlay(config.homeId, accessory.context.config.zoneId)
                } else {
                  await tado.setZoneOverlay(config.homeId, accessory.context.config.zoneId, power, temp, accessory.context.config.mode, accessory.context.config.temperatureUnit)
                }
                
                delayTimer[accessory.displayName] = null;
                
              }, timer * 1000);
              
            }
            
          } else {
            
            if([0,1,3].includes(value)){
              
              //targetState
              clear = value === 3;
              
              power = value
                ? 'ON'
                : 'OFF';
              
              temp = service
                .getCharacteristic(targetTempCharacteristic)
                .value;
              
            } else {
              
              //temp
              power = 'ON';
              temp = value;
              
            }
            
            if(clear){
              await tado.clearZoneOverlay(config.homeId, accessory.context.config.zoneId)
            } else {
              await tado.setZoneOverlay(config.homeId, accessory.context.config.zoneId, power, temp, accessory.context.config.mode, accessory.context.config.temperatureUnit)
            }
            
          }

          break;  
          
        }  
          
        case 'zone-switch':
        case 'zone-faucet': {
          
          let faucetService = accessory.getService(api.hap.Service.Faucet);
          
          let temp = null;
          let power = value 
            ? 'ON'
            : 'OFF';
            
          if(faucetService)
            faucetService
              .getCharacteristic(this.api.hap.Characteristic.InUse)
              .updateValue(value);
        
          await tado.setZoneOverlay(config.homeId, accessory.context.config.zoneId, power, temp, accessory.context.config.mode, accessory.context.config.temperatureUnit)

          break;  
          
        }  
        
        case 'extra-plock': {
          
          let targetState;
        
          if(value === 1){ //away
            
            targetState = 'AWAY';
            
          } else if(value === 3){ //off
            
            targetState = 'AUTO';
            
          } else { //at home
            
            targetState = 'HOME';
            
          }
          
          await tado.setPresenceLock(config.homeId, targetState)

          break;  
          
        }  
          
        case 'zone-window-switch': {
        
          await tado.setWindowDetection(config.homeId, accessory.context.config.zoneId, value, 3600);
          await tado.setOpenWindowMode(config.homeId, accessory.context.config.zoneId, value);

          break;  
          
        }  
          
        case 'extra-childswitch': {
        
          await tado.setChildLock(accessory.context.config.serialNumber, value);

          break;  
          
        }
          
        case 'extra-cntrlswitch':
        case 'extra-turnoff':
        case 'extra-boost': {
        
          if(!value && accessory.context.config.subtype !== 'extra-cntrlswitch')
            return
          
          const rooms = accessory.context.config.rooms.map(room => {
             return {
               id: room.id,
               power: accessory.context.config.subtype === 'extra-cntrlswitch'
                 ? value
                   ? 'ON'
                   : 'OFF'
                 : accessory.context.config.subtype === 'extra-turnoff'
                   ? 'OFF'
                   : 'ON',
               maxTempInCelsius: accessory.context.config.subtype === 'extra-cntrlswitch'
                 ? value
                   ? 25
                   : 0
                 : accessory.context.config.subtype === 'extra-turnoff'
                   ? false
                   : 25,
               termination: ['MANUAL', 'AUTO', 'TIMER'].includes(room.mode)
                 ? room.mode
                 : 'MANUAL',
               timer: ['MANUAL', 'AUTO', 'TIMER'].includes(room.mode) && room.mode === 'TIMER'
                 ? room.modeTimer && room.modeTimer >= 1
                    ? room.modeTimer * 60
                    : 1800 //30min
                 : false
              }
            }).filter(room => room);
          
          if(accessory.context.config.subtype !== 'extra-cntrlswitch'){
            setTimeout(() => {
              accessory
                .getService(api.hap.Service.Switch)
                .getCharacteristic(api.hap.Characteristic.On)
                .updateValue(!value);
            }, 500);
          }
          
          await tado.switchAll(config.homeId, rooms)

          break;  
          
        }  
          
        case 'extra-shedule': {
        
          const roomIds = accessory.context.config.rooms.map(room => {
            return room.id;
          }).filter(id => id);
          
          setTimeout(() => {
            accessory
              .getService(api.hap.Service.Switch)
              .getCharacteristic(api.hap.Characteristic.On)
              .updateValue(!value);
          }, 500);
            
          await tado.resumeShedule(config.homeId, roomIds)

          break;  
          
        }
          
        default:
          Logger.warn('Unknown accessory type! [' + accessory.context.config.subtype + '] ' + target + ': ' + value, accessory.displayName);
          break;
      }
    
    } catch(err) {
    
      errorHandler(err);
    
    } finally {
    
      settingState = false;
    
    }
 
  }
  
  async function changedStates(accessory, historyService, replacer, value){
  
    if(value.oldValue !== value.newValue){
    
      switch(accessory.context.config.subtype){
      
        case 'zone-thermostat': {
        
          let currentState = accessory.getService(api.hap.Service.Thermostat).getCharacteristic(api.hap.Characteristic.CurrentHeatingCoolingState).value;  
          let targetState = accessory.getService(api.hap.Service.Thermostat).getCharacteristic(api.hap.Characteristic.TargetHeatingCoolingState).value;  
          let currentTemp = accessory.getService(api.hap.Service.Thermostat).getCharacteristic(api.hap.Characteristic.CurrentTemperature).value; 
          let targetTemp = accessory.getService(api.hap.Service.Thermostat).getCharacteristic(api.hap.Characteristic.TargetTemperature).value; 
            
          let valvePos = currentTemp <= targetTemp && currentState !== api.hap.Characteristic.CurrentHeatingCoolingState.OFF && targetState !== api.hap.Characteristic.TargetHeatingCoolingState.OFF
            ? Math.round(((targetTemp - currentTemp) >= 5 ? 100 : (targetTemp - currentTemp) * 20))
            : 0;
            
          historyService.addEntry({time: moment().unix(), currentTemp: currentTemp, setTemp: targetTemp, valvePosition: valvePos});
        
          break;
        
        }
           
        case 'zone-window-contact': {
        
          if(value.newValue){
          
            accessory.context.timesOpened = accessory.context.timesOpened || 0;
            accessory.context.timesOpened += 1;
            
            let lastActivation = moment().unix() - historyService.getInitialTime();
            let closeDuration = moment().unix() - historyService.getInitialTime();
            
            accessory
              .getService(api.hap.Service.ContactSensor)
              .getCharacteristic(api.hap.Characteristic.LastActivation)
              .updateValue(lastActivation);
              
            accessory
              .getService(api.hap.Service.ContactSensor)
              .getCharacteristic(api.hap.Characteristic.TimesOpened)
              .updateValue(accessory.context.timesOpened);
            
            accessory
              .getService(api.hap.Service.ContactSensor)
              .getCharacteristic(api.hap.Characteristic.ClosedDuration)
              .updateValue(closeDuration);
          
          } else {
          
            let openDuration = moment().unix() - historyService.getInitialTime();
          
            accessory
              .getService(api.hap.Service.ContactSensor)
              .getCharacteristic(api.hap.Characteristic.ClosedDuration)
              .updateValue(openDuration);
          
          }
            
          historyService.addEntry({time: moment().unix(), status: value.newValue ? 1 : 0});
          
          let dest = value.newValue
            ? 'opened'
            : 'closed';
          
          if(telegram)
            telegram.send('openWindow', dest, replacer);
        
          break;
        
        }
        
        case 'presence-motion':
        case 'presence-occupancy': {
        
          if(historyService){
       
            let lastActivation = moment().unix() - historyService.getInitialTime();
          
            accessory
              .getService(api.hap.Service.MotionSensor)
              .getCharacteristic(api.hap.Characteristic.LastActivation)
              .updateValue(lastActivation);
         
            historyService.addEntry({time: moment().unix(), status: value.newValue ? 1 : 0});
       
          }
          
          let dest = false;
          
          if(value.newValue){
            dest = accessory.displayName === 'Anyone' ? 'anyone_in' : 'user_in';
          } else {
            dest = accessory.displayName === 'Anyone' ? 'anyone_out' : 'user_out';
          }
          
          if(telegram)
            telegram.send('presence', dest, replacer === 'Anyone' ? false : replacer);
        
          break;
        
        }
        
        case 'zone-temperature':
        case 'weather-temperature': {
        
          historyService.addEntry({time: moment().unix(), temp: value.newValue, humidity: 0, ppm: 0});
        
          break;
        
        }
        
        case 'zone-humidity': {
        
          historyService.addEntry({time: moment().unix(), temp: 0, humidity: value.newValue, ppm: 0});
        
          break;
        
        }
        
        default: 
          Logger.warn('Accessory with unknown subtype wanted to store history data', accessory.displayName)
          break;
      
      }
    
    }
  
  }

  async function getStates(){
    
    try {
    
      //ME
      if(!config.homeId)
        await updateMe();
      
      //Home
      if(!config.temperatureUnit || (config.extras && config.extras.airQuality && (!config.geolocation || (config.geolocation && !config.geolocation.longitude || !config.geolocation.latitude))))
        await updateHome();
      
      //Zones 
      if(config.zones.length)
        await updateZones();      
      
      //MobileDevices     
      if(config.presence.length)
        await updateMobileDevices();
      
      //Weather
      if(config.weather.temperatureSensor || config.weather.solarIntensity)
        await updateWeather();
      
      //AirQuality
      if(config.weather.airQuality && config.geolocation && config.geolocation.longitude && config.geolocation.latitude)
        await updateAirQuality();
      
      //RunningTime
      if(config.extras.centralSwitch && config.extras.runningInformation)
        await updateRunningTime();
      
      //Presence Lock  
      if(config.extras.presenceLock)
        await updatePresence();
        
      //Child Lock  
      if(config.childLock.length)
        await updateDevices();
    
    } catch(err) {
    
      errorHandler(err);
    
    } finally {
        
      setTimeout(() => {
        getStates();
      }, config.polling * 1000);
    
    }
 
  }
  
  async function updateMe(){
  
    if(!settingState){
    
      Logger.debug('Polling User Info...', config.homeName);
        
      const me = await tado.getMe();
      
      if(config.homeName !== me.homes[0].name)
        throw ('Cannot find requested home in the API!', config.homeName);
        
      config.homeId = me.homes[0].id;
    
    }
    
    return;
    
  }
  
  async function updateHome(){
  
    if(!settingState){
    
      Logger.debug('Polling Home Info...', config.homeName); 
                               
      const home = await tado.getHome(config.homeId);
      
      if(!config.temperatureUnit)
        config.temperatureUnit = home.temperatureUnit || 'CELSIUS';
    
      //config.skills = home.skills || []; //do we need this?
      
      if(!config.geolocation || (config.geolocation && !config.geolocation.longitude || !config.geolocation.latitude)){
        
        if(!home.geolocation)
          home.geolocation = {};
  
        config.geolocation = {
          longitude: (home.geolocation.longitude || '').toString() || false,
          latitude: (home.geolocation.latitude || '').toString() || false 
        };
      
      }
    
    }
    
    return;
    
  }
  
  async function updateZones(){
  
    if(!settingState){
    
      Logger.debug('Polling Zones...', config.homeName);
      
      //CentralSwitch
      let inManualMode = 0;
      let inOffMode = 0;
      let inAutoMode = 0;
      
      let zonesWithoutID = config.zones.filter(zone => zone && !zone.id);
      
      if(zonesWithoutID.length){
        
        const allZones = await tado.getZones(config.homeId) || [];
        
        for(const [index, zone] of config.zones.entries()){
          allZones.forEach(zoneWithID => {
            if(zoneWithID.name === zone.name)
              config.zones[index].id = zoneWithID.id;
          });
        }
        
      }
      
      const allZones = await tado.getZones(config.homeId) || [];
      
      for(const [index, zone] of config.zones.entries()){
        allZones.forEach(zoneWithID => {
          if(zoneWithID.name === zone.name){
            config.zones[index].id = zoneWithID.id;
            config.zones[index].battery = zoneWithID.devices.filter(device => zone.type === 'HEATING' && device && !device.batteryState.includes('NORMAL')).length
              ? zoneWithID.devices.filter(device => device && !device.batteryState.includes('NORMAL'))[0].batteryState
              : zoneWithID.devices.filter(device => device && device.duties.includes('ZONE_LEADER'))[0].batteryState;
            config.zones[index].openWindowEnabled = zoneWithID.openWindowDetection && zoneWithID.openWindowDetection.enabled
              ? true
              : false;
          }
        });
      }
      
      for(const zone of config.zones){
      
        const zoneState = await tado.getZoneState(config.homeId, zone.id);
        
        let currentState, targetState, currentTemp, targetTemp, humidity, active, battery;

        if(zoneState.setting.type === 'HEATING'){
          
          battery = zone.battery === 'NORMAL'
            ? 100
            : 10;
      
          if(zoneState.sensorDataPoints.humidity)
            humidity = zoneState.sensorDataPoints.humidity.percentage;
          
          //HEATING
          if(zoneState.sensorDataPoints.insideTemperature){
            
            currentTemp = config.temperatureUnit === 'CELSIUS'
              ? zoneState.sensorDataPoints.insideTemperature.celsius
              : zoneState.sensorDataPoints.insideTemperature.fahrenheit;
            
            if(zoneState.setting.power === 'ON'){
              
              targetTemp = config.temperatureUnit === 'CELSIUS'
                ? zoneState.setting.temperature.celsius
                : zoneState.setting.temperature.fahrenheit;
                
              currentState = currentTemp <= targetTemp
                ? 1
                : 2;
                
              targetState = 1;  
                
              active = 1;
              
            }
            
            if(zoneState.setting.power === 'OFF'){
              currentState = 0;
              targetState = 0;
              active = 0;
            }
            
            if(zoneState.overlayType === null)
              targetState = 3;
            
          }
          
          //Thermostat/HeaterCooler
          const thermoAccessory = accessories.filter(acc => acc && (acc.context.config.subtype === 'zone-thermostat' || acc.context.config.subtype === 'zone-heatercooler'));
          
          if(thermoAccessory.length){
            
            thermoAccessory.forEach(acc => {
              
              if(acc.displayName.includes(zone.name)){
                
                let serviceThermostat = acc.getService(api.hap.Service.Thermostat);     
                let serviceHeaterCooler = acc.getService(api.hap.Service.HeaterCooler);   
                 
                let serviceBattery = acc.getService(api.hap.Service.BatteryService); 
                let characteristicBattery = api.hap.Characteristic.BatteryLevel;
                
                if(serviceBattery && zone.battery){
                  
                  serviceBattery
                    .getCharacteristic(characteristicBattery)
                    .updateValue(battery);
               
                }
                
                if(serviceThermostat){
                  
                  let characteristicCurrentTemp = api.hap.Characteristic.CurrentTemperature;
                  let characteristicTargetTemp = api.hap.Characteristic.TargetTemperature;
                  let characteristicCurrentState = api.hap.Characteristic.CurrentHeatingCoolingState;
                  let characteristicTargetState = api.hap.Characteristic.TargetHeatingCoolingState;
                  let characteristicHumidity = api.hap.Characteristic.CurrentRelativeHumidity;         
                  
                  if(!isNaN(currentTemp))
                    serviceThermostat
                      .getCharacteristic(characteristicCurrentTemp)
                      .updateValue(currentTemp);
                   
                  if(!isNaN(targetTemp))  
                    serviceThermostat
                      .getCharacteristic(characteristicTargetTemp)
                      .updateValue(targetTemp);
                    
                  if(!isNaN(currentState))  
                    serviceThermostat
                      .getCharacteristic(characteristicCurrentState)
                      .updateValue(currentState);
                    
                  if(!isNaN(targetState))  
                    serviceThermostat
                      .getCharacteristic(characteristicTargetState)
                      .updateValue(targetState);
                    
                  if(!isNaN(humidity))
                    serviceThermostat
                      .getCharacteristic(characteristicHumidity)
                      .updateValue(humidity);
                    
                }
                
                if(serviceHeaterCooler){
                  
                  let characteristicCurrentTemp = api.hap.Characteristic.CurrentTemperature;
                  let characteristicTargetTempHeat = api.hap.Characteristic.HeatingThresholdTemperature;
                  let characteristicTargetTempCool = api.hap.Characteristic.CoolingThresholdTemperature;
                  let characteristicCurrentState = api.hap.Characteristic.CurrentHeaterCoolerState;
                  let characteristicTargetState = api.hap.Characteristic.TargetHeaterCoolerState;
                  let characteristicActive = api.hap.Characteristic.Active;
                  
                  currentState = currentState === 2
                    ? 3
                    : currentState === 1
                      ? 2
                      : 0;
                      
                  targetState = 1;
                  
                  if(!isNaN(active))  
                    serviceHeaterCooler
                      .getCharacteristic(characteristicActive)
                      .updateValue(active);
                  
                  if(!isNaN(currentTemp))  
                    serviceHeaterCooler
                      .getCharacteristic(characteristicCurrentTemp)
                      .updateValue(currentTemp);
                   
                  if(!isNaN(targetTemp))    
                    serviceHeaterCooler
                      .getCharacteristic(currentState === 2 
                        ? characteristicTargetTempHeat
                        : characteristicTargetTempCool)
                      .updateValue(targetTemp);
                  
                  if(!isNaN(currentState))    
                    serviceHeaterCooler
                      .getCharacteristic(characteristicCurrentState)
                      .updateValue(currentState);
                  
                  if(!isNaN(targetState))    
                    serviceHeaterCooler
                      .getCharacteristic(characteristicTargetState)
                      .updateValue(targetState);
                  
                }
                
              }
              
            });
            
          }
          
        } else {
          
          //HOT_WATER
          currentTemp = config.temperatureUnit === 'CELSIUS'
            ? zoneState.setting.temperature.celsius
            : zoneState.setting.temperature.fahrenheit;
            
          targetTemp = currentTemp;
          
          currentState = 1;
          targetState = 1;
          
          active = zoneState.setting.power === 'ON'
            ? 1
            : 0;
          
          //Thermostat/HeaterCooler
          const heaterAccessory = accessories.filter(acc => acc && acc.context.config.subtype === 'zone-heatercooler-boiler');
          const switchAccessory = accessories.filter(acc => acc && acc.context.config.subtype === 'zone-switch');
          const faucetAccessory = accessories.filter(acc => acc && acc.context.config.subtype === 'zone-faucet');         
            
          if(heaterAccessory.length){
            
            heaterAccessory.forEach(acc => {
              
              if(acc.displayName.includes(zone.name)){
                
                let service = acc.getService(api.hap.Service.HeaterCooler);   
                
                let characteristicCurrentTemp = api.hap.Characteristic.CurrentTemperature;
                let characteristicTargetTemp = api.hap.Characteristic.HeatingThresholdTemperature;
                let characteristicCurrentState = api.hap.Characteristic.CurrentHeaterCoolerState;
                let characteristicTargetState = api.hap.Characteristic.TargetHeaterCoolerState;
                let characteristicActive = api.hap.Characteristic.Active;
                
                if(!isNaN(active))  
                  service
                    .getCharacteristic(characteristicActive)
                    .updateValue(active);
                
                if(!isNaN(currentTemp))  
                  service
                    .getCharacteristic(characteristicCurrentTemp)
                    .updateValue(currentTemp);
                  
                if(!isNaN(targetTemp))    
                  service
                    .getCharacteristic(characteristicTargetTemp)
                    .updateValue(targetTemp);
                  
                if(!isNaN(currentState))    
                  service
                    .getCharacteristic(characteristicCurrentState)
                    .updateValue(currentState);
                
                if(!isNaN(targetState))    
                  service
                    .getCharacteristic(characteristicTargetState)
                    .updateValue(targetState);
                
              }
              
            });
            
          }
          
          if(switchAccessory.length){
            
            switchAccessory.forEach(acc => {
              
              if(acc.displayName.includes(zone.name)){
                
                let service = acc.getService(api.hap.Service.Switch);
                
                let characteristic = api.hap.Characteristic.On;
                
                service
                  .getCharacteristic(characteristic)
                  .updateValue(active ? true : false);
                    
              }
              
            });
            
          }
          
          if(faucetAccessory.length){
            
            faucetAccessory.forEach(acc => {
              
              if(acc.displayName.includes(zone.name)){
                
                let service = acc.getService(api.hap.Service.Valve);
                
                let characteristic = api.hap.Characteristic.Active;
                
                service
                  .getCharacteristic(characteristic)
                  .updateValue(active ? 1 : 0);
                    
              }
              
            });
            
          }
          
        }
        
        //TemperatureSensor
        const tempAccessory = accessories.filter(acc => acc && acc.context.config.subtype === 'zone-temperature');
        
        if(tempAccessory.length){
          
          tempAccessory.forEach(acc => {
              
            if(acc.displayName.includes(zone.name)){
              
              let serviceBattery = acc.getService(api.hap.Service.BatteryService); 
              let characteristicBattery = api.hap.Characteristic.BatteryLevel;
              
              if(serviceBattery && !isNaN(battery)){
                
                serviceBattery
                  .getCharacteristic(characteristicBattery)
                  .updateValue(battery);
             
              }
            
              if(!isNaN(currentTemp)){
                
                let service = acc.getService(api.hap.Service.TemperatureSensor);          
                let characteristic = api.hap.Characteristic.CurrentTemperature;
                  
                service
                  .getCharacteristic(characteristic)
                  .updateValue(currentTemp);
              
              }
              
            }
            
          });
          
        }
        
        //HumiditySensor
        const humidityAccessory = accessories.filter(acc => acc && acc.context.config.subtype === 'zone-humidity');
        
        if(humidityAccessory.length){
          
          humidityAccessory.forEach(acc => {
              
            if(acc.displayName.includes(zone.name)){
              
              let serviceBattery = acc.getService(api.hap.Service.BatteryService); 
              let characteristicBattery = api.hap.Characteristic.BatteryLevel;
              
              if(serviceBattery && !isNaN(battery)){
                
                serviceBattery
                  .getCharacteristic(characteristicBattery)
                  .updateValue(battery);
             
              }
            
              if(!isNaN(humidity)){
            
                let service = acc.getService(api.hap.Service.HumiditySensor);          
                let characteristic = api.hap.Characteristic.CurrentRelativeHumidity;
                  
                service
                  .getCharacteristic(characteristic)
                  .updateValue(humidity);
                
                }
              
              }
            
          });
          
        }
        
        //WindowSensor
        const windowAccessory = accessories.filter(acc => acc && (acc.context.config.subtype === 'zone-window-switch' || acc.context.config.subtype === 'zone-window-contact'));
        
        if(windowAccessory.length){
          
          windowAccessory.forEach(acc => {
              
            if(acc.displayName.includes(zone.name)){
              
              let serviceBattery = acc.getService(api.hap.Service.BatteryService); 
              let characteristicBattery = api.hap.Characteristic.BatteryLevel;
              
              if(serviceBattery && !isNaN(battery)){
                
                serviceBattery
                  .getCharacteristic(characteristicBattery)
                  .updateValue(battery);
             
              }
            
              let serviceSwitch = acc.getService(api.hap.Service.Switch);    
              let serviceContact = acc.getService(api.hap.Service.ContactSensor);   
              
              let service = serviceSwitch || serviceContact;
              
              let characteristic = serviceSwitch
                ? api.hap.Characteristic.On
                : api.hap.Characteristic.ContactSensorState;
                
              let state = serviceSwitch
                ? zone.openWindowEnabled
                  ? true
                  : false
                : zoneState.openWindow === null
                  ? 0
                  : 1;
                
              service
                .getCharacteristic(characteristic)
                .updateValue(state);
              
            }
            
          });
          
        }
        
        //CentralSwitch
        if(zoneState.overlayType === null)
          inAutoMode += 1;
          
        if(zoneState.overlayType !== null && zoneState.setting.power === 'OFF')
          inOffMode += 1;
          
        if(zoneState.overlayType !== null && zoneState.setting.power === 'ON' && zoneState.overlay.termination)
          inManualMode += 1;

      }
      
      //CentralSwitch
      const centralSwitchAccessory = accessories.filter(acc => acc && acc.displayName === 'Central Switch');
      
      if(centralSwitchAccessory.length){

        let service = centralSwitchAccessory[0].getService(api.hap.Service.Switch);          
        let characteristicAuto = api.hap.Characteristic.AutoThermostats;
        let characteristicOff = api.hap.Characteristic.OfflineThermostats;
        let characteristicManual = api.hap.Characteristic.ManualThermostats;
        
        service
          .getCharacteristic(characteristicAuto)
          .updateValue(inAutoMode);
          
        service
          .getCharacteristic(characteristicManual)
          .updateValue(inManualMode);
          
        service
          .getCharacteristic(characteristicOff)
          .updateValue(inOffMode);
        
      }
    
    }
    
  }
  
  async function updateMobileDevices(){
  
    if(!settingState){
    
      Logger.debug('Polling MobileDevices...', config.homeName); 
                                 
      const mobileDevices = await tado.getMobileDevices(config.homeId);
      
      const userAccessories = accessories.filter(user => user && user.context.config.subtype.includes('presence') && user.displayName !== 'Anyone Sensor');
      
      const anyone = accessories.filter(user => user && user.context.config.subtype.includes('presence') && user.displayName === 'Anyone Sensor');
      
      let activeUser = 0;
      
      mobileDevices.forEach(device => {
        userAccessories.forEach(acc => {
          if(device.name === acc.displayName){
            
            let atHome = device.location && device.location.atHome
              ? 1
              : 0;
              
            if(atHome)
              activeUser += 1;
            
            let service = acc.getService(api.hap.Service.MotionSensor) || acc.getService(api.hap.Service.OccupancySensor)
            
            let characteristic = service.testCharacteristic(api.hap.Characteristic.MotionDetected)
              ? api.hap.Characteristic.MotionDetected
              : api.hap.Characteristic.OccupancyDetected;
            
              service
                .getCharacteristic(characteristic)
                .updateValue(atHome)

          }
        });
      });
      
      if(anyone.length){
      
        let service = anyone[0].getService(api.hap.Service.MotionSensor) || anyone[0].getService(api.hap.Service.OccupancySensor)
              
        let characteristic = service.testCharacteristic(api.hap.Characteristic.MotionDetected)
          ? api.hap.Characteristic.MotionDetected
          : api.hap.Characteristic.OccupancyDetected;
  
        service
         .getCharacteristic(characteristic)
         .updateValue(activeUser ? 1 : 0);
       
      }
    
    }
    
    return; 
    
  }
  
  async function updateWeather(){
  
    if(!settingState){
      
      Logger.debug('Polling Weather...', config.homeName); 
            
      const weather = await tado.getWeather(config.homeId);
      
      const weatherTemperatureAccessory = accessories.filter(acc => acc && acc.displayName === 'Weather Temperature Sensor');
      
      const solarIntensityAccessory = accessories.filter(acc => acc && acc.displayName === 'Solar Intensity');
      
      if(weatherTemperatureAccessory.length && weather.outsideTemperature){
        
        let tempUnit = config.temperatureUnit;
        let service = weatherTemperatureAccessory[0].getService(api.hap.Service.TemperatureSensor);          
        let characteristic = api.hap.Characteristic.CurrentTemperature;
          
        let temp = tempUnit === 'FAHRENHEIT'
          ? weather.outsideTemperature.fahrenheit
          : weather.outsideTemperature.celsius;
          
        service
         .getCharacteristic(characteristic)
         .updateValue(temp);
        
      }
      
      if(solarIntensityAccessory.length && weather.solarIntensity){
        
        let state = weather.solarIntensity.percentage !== 0
        let brightness = weather.solarIntensity.percentage;
        
        solarIntensityAccessory[0].context.lightBulbState = state;
        solarIntensityAccessory[0].context.lightBulbBrightness = brightness;
        
        let service = solarIntensityAccessory[0].getService(api.hap.Service.Lightbulb);          
        let characteristicOn = api.hap.Characteristic.On;
        let characteristicBrightness = api.hap.Characteristic.Brightness;
        
        service
          .getCharacteristic(characteristicOn)
          .updateValue(state);
         
        service
          .getCharacteristic(characteristicBrightness)
          .updateValue(brightness);
        
      }
    
    }
    
    return;
  
  }
  
  async function updateAirQuality(){  
  
    if(!settingState){   
    
      Logger.debug('Polling AirQuality...', config.homeName);
      
      const airQuality = await tado.getWeatherAirComfort(config.homeId, config.geolocation.longitude, config.geolocation.latitude);
      
      const airQualityAccessory = accessories.filter(acc => acc && acc.displayName === 'Air Quality Sensor');
      
      let service = airQualityAccessory[0].getService(api.hap.Service.AirQualitySensor);          
      
      let characteristicAqi = api.hap.Characteristic.AirQuality;
      let characteristicPm10 = api.hap.Characteristic.PM10Density;
      let characteristicPm25 = api.hap.Characteristic.PM2_5Density;
      let characteristicNdd = api.hap.Characteristic.NitrogenDioxideDensity;
      let characteristicOd = api.hap.Characteristic.OzoneDensity;
      let characteristicSdd = api.hap.Characteristic.SulphurDioxideDensity;
      
      if(airQuality.outdoorQuality){
        
        let returnPol = (target) => airQuality.outdoorQuality.pollutants.filter(pol => pol &&  pol.scientificName.includes(target));
        
        let aqi = airQuality.outdoorQuality.aqi.value >= 80
          ? 1
          : airQuality.outdoorQuality.aqi.value >= 60
            ? 2
            : airQuality.outdoorQuality.aqi.value >= 40
              ? 3
              : airQuality.outdoorQuality.aqi.value >= 20
                ? 4
                : airQuality.outdoorQuality.aqi.value >= 0
                  ? 5
                  : 0;
        
        let pm10 = returnPol('PM<sub>10</sub>')[0].concentration.value;
        let pm25 = returnPol('PM<sub>2.5</sub>')[0].concentration.value;
        let ndd = returnPol('NO<sub>2</sub>')[0].concentration.value;
        let od = returnPol('O<sub>3</sub>')[0].concentration.value;
        let sdd = returnPol('SO<sub>2</sub>')[0].concentration.value;
        
        if(!isNaN(aqi))
          service
            .getCharacteristic(characteristicAqi)
            .updateValue(aqi);
            
        if(!isNaN(pm10))
          service
            .getCharacteristic(characteristicPm10)
            .updateValue(pm10);
            
        if(!isNaN(pm25))
          service
            .getCharacteristic(characteristicPm25)
            .updateValue(pm25);
        
        if(!isNaN(ndd))
          service
            .getCharacteristic(characteristicNdd)
            .updateValue(ndd * 1.9123);
            
        if(!isNaN(od))
          service
            .getCharacteristic(characteristicOd)
            .updateValue(od * 1.9954);
            
        if(!isNaN(sdd))
          service
            .getCharacteristic(characteristicSdd)
            .updateValue(sdd * 2.6647);
        
      }
    
    }
  
    return;
    
  }
  
  async function updatePresence(){    
  
    if(!settingState){
       
      Logger.debug('Polling PresenceLock...', config.homeName);
    
      const presenceLock = await tado.getState(config.homeId);
      
      const presenceLockAccessory = accessories.filter(acc => acc && acc.displayName === 'Presence Lock');
      
      /*
        0: Home
        1: Away
        3: Off
      */

      let state = presenceLock.presenceLocked
        ? presenceLock.presence === 'AWAY'
          ? 1
          : 0
        : 3;
        
      let service = presenceLockAccessory[0].getService(api.hap.Service.SecuritySystem);          
      let characteristicCurrent = api.hap.Characteristic.SecuritySystemCurrentState;
      let characteristicTarget = api.hap.Characteristic.SecuritySystemTargetState;
      
      service
        .getCharacteristic(characteristicCurrent)
        .updateValue(state)
        
      service
        .getCharacteristic(characteristicTarget)
        .updateValue(state)
     
    }
  
  }
  
  async function updateRunningTime(){
  
    if(!settingState){
    
      Logger.debug('Polling RunningTime...', config.homeName);
      
      let fromDate = moment().format('YYYY-MM-01');
      let toDate = moment().format('YYYY-MM-DD');
      
      const runningTime = await tado.getRunningTime(config.homeId, fromDate, toDate);
      
      const centralSwitchAccessory = accessories.filter(acc => acc && acc.displayName === 'Central Switch');
      
      let summaryInHours = Math.round(((Math.round(runningTime.summary.totalRunningTimeInSeconds / 3600)) + Number.EPSILON) * 100) / 100
      
      let service = centralSwitchAccessory[0].getService(api.hap.Service.Switch);          
      let characteristic = api.hap.Characteristic.OverallHeat;
      
      service
        .getCharacteristic(characteristic)
        .updateValue(summaryInHours);
    
    }
  
    return;
    
  }
  
  async function updateDevices(){
  
    if(!settingState){
  
      Logger.debug('Polling Devices...', config.homeName);
      
      const devices = await tado.getDevices(config.homeId);
      
      const childLockAccessories = accessories.filter(acc => acc && acc.context.config.subtype === 'extra-childswitch');
      
      devices.forEach(device => {
        childLockAccessories.forEach(acc => {
          if(device.serialNo === acc.context.config.serialNumber){
            
            let childLockEnabled = device.childLockEnabled || false;
              
            let service = acc.getService(api.hap.Service.Switch);       
            let characteristic = api.hap.Characteristic.On;
            
            service
              .getCharacteristic(characteristic)
              .updateValue(childLockEnabled)

          }
        });
      });
    
    }
  
    return;
  
  }
  
  function errorHandler(err) {
  
    if(err.options){
    
      Logger.debug('API request ' + err.options.method + ' ' + err.options.url.pathname + ' <error> ' + err.message, config.homeName);
      Logger.error(err.message, config.homeName);
    
    } else {
    
      Logger.error(err, config.homeName);
    
    }
    
    return;
  
  }    

  return {
    getStates: getStates,
    setStates: setStates,
    changedStates: changedStates
  };

};
