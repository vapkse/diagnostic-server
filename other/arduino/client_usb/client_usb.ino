/*
 USB Interface for amplifiers
 Version 2.5.2
 Date: 14.01.2016
 Authors: Da Silva Serge
 ******************* WARNING *******************
 * The Rx pin must have a 1K pull-up resistor. * 
 ***********************************************
*/

#include <SoftwareSerial.h>
#include <AmpTransfer.h>

static const uint8_t INDEX_USBCTRL = 255;
static const uint8_t controllerId = INDEX_USBCTRL;

const uint8_t ledPin = 13;

const uint8_t rx1Pin = 2;
const uint8_t tx1Pin = 5;
const uint8_t rx2Pin = 3;
const uint8_t tx2Pin = 6;

const uint8_t portsCount = 2;
const uint16_t paramsTimeOut = 1500;
const uint16_t dataTimeOut = 800;
const uint16_t commandTimeOut = 800;
const uint16_t globalRequestTimeOut = 1400;

SoftwareSerial ports[] = {SoftwareSerial(rx1Pin, tx1Pin, false), SoftwareSerial(rx2Pin, tx2Pin, false)};

// Store port/card infos
struct ampInfo : SerialRequest
{
    uint32_t lastSeen;
    uint32_t nextDataRequest;
};
ampInfo ampInfos[portsCount];

// Response parameters
SerialBuffer response;
SerialResponse *responseBuffer = (SerialResponse *)response.alloc(SERIAL_BUFFER_SIZE);

// Global request parameters
SerialResponse globalResponses[portsCount];
int globalRequestTarget[portsCount];
int globalRequestPort = -1;
uint8_t globalRequestMessage;
uint8_t globalRequestValue;
uint8_t globalRequestSize;

// Request parameters
uint32_t requestTimeOut;
uint8_t requestedPort;
SerialBuffer request;
SerialRequest *requestBuffer = (SerialRequest *)request.alloc(SERIAL_BUFFER_SIZE);

// Calc the best next port to request
int getNextPort()
{
    uint32_t currentTime = millis();
    uint32_t bestTime = currentTime + 2000000000;
    int port = -1;

    for (uint8_t p = 0; p < portsCount; p++)
    {
        ampInfo *info = &ampInfos[p];
        if (info->nextDataRequest < bestTime)
        {
            bestTime = info->nextDataRequest;
            port = p;
        }
    }

    return port;
}

// Return the port connected to the card with the specified id
int getPortFromId(uint8_t id)
{
    int port = -1;
    for (uint8_t p = 0; p < portsCount; p++)
    {
        if (ampInfos[p].id == id)
        {
            port = p;
            break;
        }
    }
    return port;
}

// Close the current response
void closeResponse()
{
    response.close();
    requestTimeOut = 0;
}

// Send the specified parameters to the Serial port
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

// Send the specified request to the card connected to the specified port number
void sendRequest(uint8_t port, uint8_t size, uint8_t msg, uint8_t value, uint32_t timeOut)
{
    ampInfo *info = &ampInfos[port];

    // Request current port
    info->msg = msg;
    info->value = value;

    requestTimeOut = timeOut;
    requestedPort = port;

    response.begin(&ports[port]);
    ports[port].listen();

    // Transfer request to right port
    request.send(&ports[port], size);
    ports[port].flush();
}

// Close the current global request
void closeGlobalRequest()
{
    globalRequestPort = -1;
    closeResponse();
}

// Send the next global request
void sendNextGlobalRequest()
{
    ++globalRequestPort;
    if (globalRequestPort == portsCount)
    {
        checkGlobalResponses();
    }
    else
    {
        uint32_t currentTime = millis();
        sendRequest(globalRequestPort, globalRequestSize, globalRequestMessage, globalRequestValue, currentTime + globalRequestTimeOut);
    }
}

// Send a global request.
void sendGlobalRequest(uint8_t size, uint8_t msg, uint8_t value)
{
    if (globalRequestPort >= 0)
    {
        closeGlobalRequest();
    }

    globalRequestMessage = msg;
    globalRequestValue = value;
    globalRequestSize = size;

    sendNextGlobalRequest();
}

// Check all the responses from a global request and send the response to the Serial port
void checkGlobalResponses()
{
    uint8_t id = 0;
    uint8_t msg = 0;
    uint8_t errorNumber = 0;
    int value = -1;

    for (uint8_t port = 0; port < portsCount; port++)
    {
        SerialResponse *resp = &globalResponses[port];
        msg = resp->msg;
        errorNumber = resp->errorNumber;
        if (errorNumber > 0)
        {
            id = resp->id;
            value = resp->extraValue;
            break;
        }
        else if (value >= 0 && resp->extraValue != value)
        {
            // Error differents values returned by the cards
            errorNumber = ERROR_GLOBALREQUESTVALUES;
            break;
        }
        else
        {
            value = resp->extraValue;
        }
    }

    closeResponse();
    sendResponse(id, msg, errorNumber, (uint8_t)value);
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

    // Start each soft serial port
    for (uint8_t port = 0; port < portsCount; port++)
    {
        ampInfo *info = &ampInfos[port];
        info->lastSeen = 0;
        info->id = 0;
        info->msg = 0;
        info->value = 0;
        info->nextDataRequest = 0;
        ports[port].begin(2400);
    }

    requestTimeOut = 0;
}

void loop()
{
    uint32_t currentTime = millis();

    // *** Response ***
    if (requestTimeOut > 0)
    {
        ampInfo *info = &ampInfos[requestedPort];
        if (currentTime > requestTimeOut)
        {
            // Time out
            uint8_t errorNumber;
            if (info->lastSeen == 0 || currentTime - info->lastSeen > 60000)
            {
                errorNumber = ERROR_OFFLINE;
            }
            else
            {
                errorNumber = ERROR_TIMEOUT;
            }

            if (info->msg == REQUEST_GETDATA && currentTime - info->lastSeen > 20000)
            {
                info->nextDataRequest = errorNumber == ERROR_OFFLINE && currentTime > 120000 ? currentTime + 10000 : currentTime + 1000;
            }
            else
            {
                info->nextDataRequest = currentTime + 500;
            }

            responseBuffer->id = requestBuffer->id;
            responseBuffer->msg = requestBuffer->msg;
            responseBuffer->errorNumber = errorNumber;
            responseBuffer->extraValue = requestedPort;

            if (globalRequestPort == -1)
            {
                response.send(&Serial, sizeof(struct SerialResponse));
                Serial.flush();
                closeResponse();
                // Wait that some datas can arrive late and serial buffer must be empty before a new request
                delay(200);
            }
            else
            {
                response.copyTo(&globalResponses[globalRequestPort], sizeof(struct SerialResponse));
                closeResponse();
                sendNextGlobalRequest();
            }
        }
        else if (ports[requestedPort].available() > 0)
        {
            if (response.receive())
            {
                digitalWrite(ledPin, HIGH);
                if (info->msg == REQUEST_GETDATA)
                {
                    DataResponseHeader *dataResponse = (DataResponseHeader *)responseBuffer;
                    info->id = dataResponse->id;

                    // Next request depend of the status of the card
                    switch (dataResponse->step)
                    {
                    case SEQUENCE_DISCHARGE:
                    case SEQUENCE_HEAT:
                        info->nextDataRequest = currentTime + 500;
                        break;
                    case SEQUENCE_FUNCTION:
                        info->nextDataRequest = currentTime + 200;
                        break;
                    case SEQUENCE_STANDBY:
                    case SEQUENCE_PRESTANDBY:
                    case SEQUENCE_FAIL:
                        info->nextDataRequest = currentTime + 1000;
                        break;
                    default:
                        // Message
                        info->nextDataRequest = currentTime + 100;
                    }
                }

                // If the card was offline, revisit the others nextRequest cards parameters
                if (info->lastSeen == 0 || currentTime - info->lastSeen > 60000)
                {
                    for (uint8_t port = 0; port < portsCount; port++)
                    {
                        ampInfo *other = &ampInfos[port];
                        if (other->lastSeen == 0 || currentTime - other->lastSeen > 60000)
                        {
                            other->nextDataRequest = currentTime;
                        }
                    }
                }

                info->lastSeen = currentTime;

                if (globalRequestPort == -1)
                {
                    response.send(&Serial);
                    Serial.flush();
                    closeResponse();
                }
                else
                {
                    response.copyTo(&globalResponses[globalRequestPort]);
                    closeResponse();
                    sendNextGlobalRequest();
                }

                digitalWrite(ledPin, LOW);
            }
        }
    }

    // *** Request ***
    if (request.receive()) {
        closeResponse();
        int port = -1;

        if (requestBuffer->id == controllerId)
        {
            // Forward request to all devices
            sendGlobalRequest(request.getSize(), requestBuffer->msg, requestBuffer->value);
            return;
        }
        else if (requestBuffer->id == 0)
        {
            // Data request, calc the best port
            port = getNextPort();
        }
        else
        {
            // Search destination port for request
            port = getPortFromId(requestBuffer->id);
        }

        if (port >= 0)
        {
            uint32_t timeOut;

            // Structure depend oof the request
            if (requestBuffer->msg == REQUEST_GETPARAMS)
            {
                timeOut = currentTime + paramsTimeOut;
            }
            else if (requestBuffer->msg == REQUEST_GETDATA)
            {
                timeOut = currentTime + dataTimeOut;
            }
            else
            {
                // Command request
                timeOut = currentTime + commandTimeOut;
            }

            globalRequestPort = -1;
            sendRequest(port, request.getSize(), requestBuffer->msg, requestBuffer->value, timeOut);
        }
        else
        {
            // Busy error, no port to request
            sendResponse(controllerId, requestBuffer->msg, ERROR_BUSY, 0);
        }
    }
}
