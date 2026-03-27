const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const logger = require('../config/logger');
const { zkpFileService } = require('../services');

const crearteCeremony = catchAsync(async (req, res) => {

    const result = await zkpFileService.ceremony();
    res.status(httpStatus.CREATED).send(result);
});

const InitialKeyGeneration = catchAsync(async (req, res) => {

    const circuit = req.query.circuitName
    const finalKey = req.query.finalKey

    const result = await zkpFileService.InitialKeyGeneration(circuit, finalKey);
    res.status(httpStatus.CREATED).send(result);
});


const generateVeriferKey = catchAsync(async (req, res) => {

    const finalKey = req.query.finalKey

    const result = await zkpFileService.generateVKey(finalKey);
    res.status(httpStatus.CREATED).send(result);
});

module.exports = {
    crearteCeremony,
    InitialKeyGeneration,
    generateVeriferKey
}