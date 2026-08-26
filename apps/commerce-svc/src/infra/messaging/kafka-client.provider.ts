import { Kafka, logLevel } from 'kafkajs';

export const KAFKA_CLIENT = Symbol('KAFKA_CLIENT');

export function createKafkaClient(): Kafka {
  return new Kafka({
    clientId: 'commerce-svc',
    brokers: (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(','),
    logLevel: logLevel.NOTHING,
  });
}
