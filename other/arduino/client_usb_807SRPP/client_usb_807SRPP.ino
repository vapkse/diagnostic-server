/*
  USB Interface for 807SRPP amplifiers
  Version 2.5.2
  Date: 29.12.2018
  Authors: Da Silva Serge
 ******************* WARNING *******************
   The Rx pin must have a 1K pull-up resistor.
 ***********************************************
*/

#include <SoftwareSerial.h>
#include <AmpTransfer.h>
#include "EasyTransfer.h"
#include "AmpTransfer_old.h"

static const uint8_t INDEX_USBCTRL = 255;
static const uint8_t controllerId = INDEX_USBCTRL;

const uint8_t ledPin = 13;

const uint8_t rx1Pin = 2;
const uint8_t tx1Pin = 5;
const uint8_t rx2Pin = 3;
const uint8_t tx2Pin = 6;

const uint8_t portsCount = 2;

SoftwareSerial ports[] = {SoftwareSerial(rx1Pin, tx1Pin, false), SoftwareSerial(rx2Pin, tx2Pin, false)};

// Response parameters
SerialBuffer response;
SerialResponse *responseBuffer = (SerialResponse *)response.alloc(SERIAL_BUFFER_SIZE);

// Request parameters
uint32_t requestTimeOut;
uint8_t requestedPort;
SerialBuffer request;
SerialRequest *requestBuffer = (SerialRequest *)request.alloc(SERIAL_BUFFER_SIZE);

EasyTransfer readDatas1;
dataResponse_old readDatasStruct1;

EasyTransfer readDatas2;
dataResponse_old readDatasStruct2;

// Close the current response
void closeResponse()
{
    response.close();
    requestTimeOut = 0;
}

// Send the specified parameters to the Serial port
void sendDataResponse(uint8_t id, uint8_t message, uint8_t errorNumber, uint8_t extraValue, dataResponse_old values)
{
    // DataResponseHeader *dataResponse = (DataResponseHeader *)responseBuffer;

    responseBuffer->errorNumber = errorNumber;
    responseBuffer->extraValue = extraValue;
    responseBuffer->msg = message;
    responseBuffer->id = id;

    // dataResponse->step = (uint8_t)values.step;
    // dataResponse->stepMaxTime = (uint8_t)values.stepMaxTime;
    // dataResponse->stepElapsedTime = (uint8_t)values.stepElapsedTime;
    // dataResponse->stepMaxValue = (uint8_t)values.stepMaxValue;
    // dataResponse->stepCurValue = (uint8_t)values.stepCurValue;
    // dataResponse->tickCount = (uint8_t)values.tickCount;

    //memcpy(dataResponse, &readDatasStruct1, sizeof(readDatasStruct1));

    response.send(&Serial, sizeof(struct SerialResponse));
    Serial.flush();
    response.close();
    requestTimeOut = 0;
}

void sendResponse(uint8_t id, uint8_t message, uint8_t errorNumber, uint8_t extraValue)
{
    responseBuffer->errorNumber = errorNumber;
    responseBuffer->extraValue = extraValue;
    responseBuffer->msg = message;
    responseBuffer->id = id;
    response.send(&Serial, sizeof(struct SerialResponse));
    Serial.flush();
    response.close();
    requestTimeOut = 0;
}

void setup()
{
    pinMode(ledPin, OUTPUT);
    pinMode(rx1Pin, INPUT);
    pinMode(rx2Pin, INPUT);

    digitalWrite(ledPin, LOW);
    digitalWrite(rx1Pin, HIGH);
    digitalWrite(rx2Pin, HIGH);

    // Open serial communications and wait for port to open:
    Serial.begin(115200);

    while (!Serial)
    {
        ; // wait for serial port to connect. Needed for native USB port only
    }

    request.begin(&Serial);

    requestTimeOut = 0;
}

void loop()
{
    uint32_t currentTime = millis();

    // *** 807SRPP ***
    ports[0].begin(9600);
    if (ports[0].available())
    {
        digitalWrite(ledPin, HIGH);
        // Init timeout
        uint32_t time1 = millis();
        while (millis() - time1 < 1000)
        {
            if (readDatas1.receiveData())
            {
                // readDatasStruct1
                break;
            }
        }
        delay(1);
        digitalWrite(ledPin, LOW);
    }
    ports[0].end();

    ports[1].begin(9600);
    if (ports[1].available())
    {
        digitalWrite(ledPin, HIGH);
        // Init timeout
        uint32_t time2 = millis();
        while (millis() - time2 < 1000)
        {
            if (readDatas2.receiveData())
            {
                // readDatasStruct2
                break;
            }
        }
        delay(1);
        digitalWrite(ledPin, LOW);
    }
    ports[1].end();
    // *** End 807SRPP ***

    // *** Request ***
    if (request.receive())
    {
        closeResponse();

        // Structure depend of the request
        if (requestBuffer->msg == REQUEST_GETDATA)
        {
            if (readDatasStruct1.message = MESSAGE_SENDVALUES)
            {
                sendDataResponse(250, REQUEST_GETDATA, readDatasStruct1.errorNumber, readDatasStruct1.errorTube, readDatasStruct1);
                readDatasStruct1.message = 0;
            }
            else if (readDatasStruct2.message = MESSAGE_SENDVALUES)
            {
                sendDataResponse(251, REQUEST_GETDATA, readDatasStruct2.errorNumber, readDatasStruct2.errorTube, readDatasStruct2);
                readDatasStruct2.message = 0;
            }
            else
            {
                sendResponse(controllerId, requestBuffer->msg, ERROR_UNKNOWNREQUEST, 0);
            }
        }
        else
        {
            sendResponse(controllerId, requestBuffer->msg, ERROR_UNKNOWNREQUEST, 0);
        }
    }
}
