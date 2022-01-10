#ifndef AmpTransfer_old_h
#define AmpTransfer_old_h

#include <stdint.h>

static const uint8_t MESSAGE_ID_ALL_OLD = 0;

static const uint8_t MESSAGE_SENDVALUES = 19;
static const uint8_t MESSAGE_RESET_OLD = 10;

typedef struct ampRequestInfos_old
{
    uint8_t id;
    uint32_t lastLogTime;
    uint32_t lastReceivedTime;
    uint8_t canBeTransfered;
} ampRequestInfos_old;

typedef struct ampRequest_old
{
    uint8_t id;
    uint8_t message;
} ampRequest_old;

// Generic data response
typedef struct dataResponse_old : ampRequest_old
{
    uint8_t step;
    uint16_t stepMaxTime;
    uint16_t stepElapsedTime;
    uint16_t stepMaxValue;
    uint16_t stepCurValue;
    uint32_t tickCount;
    uint8_t errorNumber;
    uint8_t errorTube;
    uint8_t minValue;
    uint8_t refValue;
    uint8_t maxValue;
    uint8_t output0;
    uint8_t output1;
    uint8_t output2;
    uint8_t output3;
    uint8_t output4;
    uint8_t output5;
    uint8_t output6;
    uint8_t output7;
    uint8_t measure0;
    uint8_t measure1;
    uint8_t measure2;
    uint8_t measure3;
    uint8_t measure4;
    uint8_t measure5;
    uint8_t measure6;
    uint8_t measure7;
    uint8_t temperature0;
    uint8_t temperature1;
    uint8_t temperature2;
    uint8_t temperature3;
} dataResponse_old;

#endif
