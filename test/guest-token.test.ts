/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Test } from '@nestjs/testing';
import { StockReservationService } from '../src/stock-reservation/stock-reservation.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { GuestUserService } from '../src/guest-user/guest-user.service';

describe('Guest Token System', () => {
  let service: StockReservationService;
  let prisma: PrismaService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        StockReservationService,
        {
          provide: PrismaService,
          useValue: {
            stockReservation: {
              create: jest.fn(),
              findFirst: jest.fn(),
              findMany: jest.fn(),
              update: jest.fn(),
              updateMany: jest.fn(),
              groupBy: jest.fn(),
              aggregate: jest.fn(),
              findUnique: jest.fn(),
            },
            productVariant: {
              findUnique: jest.fn(),
              update: jest.fn(),
              updateMany: jest.fn(),
            },
          },
        },
        {
          provide: GuestUserService,
          useValue: {
            findOrCreate: jest.fn(),
            findByPhone: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<StockReservationService>(StockReservationService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  describe('reserveStock with guestToken', () => {
    it('should create reservation with guestToken for anonymous user', async () => {
      const mockVariant = {
        id: 1,
        stock: 10,
        isActive: true,
        isDeleted: false,
      };

      const mockReservation = {
        id: 100,
        userId: null,
        guestToken: 'test-token-123',
        guestTokenHash: 'hashed-token',
        variantId: 1,
        quantity: 2,
        status: 'ACTIVE',
        expiresAt: new Date(),
        variant: { id: 1, sku: 'SKU-001', price: 100 },
      };

      (prisma.productVariant.findUnique as jest.Mock).mockResolvedValue(
        mockVariant,
      );
      (prisma.productVariant.updateMany as jest.Mock).mockResolvedValue({
        count: 1,
      });
      (prisma.stockReservation.create as jest.Mock).mockResolvedValue(
        mockReservation,
      );

      const result = await service.reserveStock(
        null, // no userId (anonymous)
        1, // variantId
        2, // quantity
        15, // expirationMinutes
        'test-token-123', // guestToken
      );

      expect(result.status).toBe('success');
      expect(result.data.reservationId).toBe(100);
      expect(prisma.stockReservation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: undefined, // should be undefined, not null
            guestToken: 'test-token-123',
            guestTokenHash: expect.any(String),
          }),
        }),
      );
    });

    it('should reject reservation without guestToken for anonymous user', async () => {
      await expect(
        service.reserveStock(null, 1, 2, 15, undefined),
      ).rejects.toThrow('Guest reservations require a guest token');
    });
  });

  describe('releaseReservation with guestToken', () => {
    it('should release reservation using guestToken', async () => {
      const mockReservation = {
        id: 100,
        userId: null,
        guestToken: 'test-token-123',
        variantId: 1,
        quantity: 2,
        status: 'ACTIVE',
      };

      (prisma.stockReservation.findFirst as jest.Mock).mockResolvedValue(
        mockReservation,
      );
      (prisma.productVariant.update as jest.Mock).mockResolvedValue({});
      (prisma.stockReservation.update as jest.Mock).mockResolvedValue({});

      const result = await service.releaseReservation(
        100,
        null,
        'test-token-123',
      );

      expect(result.status).toBe('success');
      expect(result.data.restoredStock).toBe(2);
      expect(prisma.stockReservation.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            guestToken: 'test-token-123',
          }),
        }),
      );
    });

    it('should be idempotent - return success if already released', async () => {
      // First call: reservation is ACTIVE
      const mockReservation = {
        id: 100,
        userId: null,
        guestToken: 'test-token-123',
        variantId: 1,
        quantity: 2,
        status: 'ACTIVE',
      };

      // Second call: reservation is already RELEASED
      const releasedReservation = {
        ...mockReservation,
        status: 'RELEASED',
      };

      (prisma.stockReservation.findFirst as jest.Mock)
        .mockResolvedValueOnce(mockReservation) // First call
        .mockResolvedValueOnce(releasedReservation); // Second call

      (prisma.productVariant.update as jest.Mock).mockResolvedValue({});
      (prisma.stockReservation.update as jest.Mock).mockResolvedValue({});

      // First release - should succeed
      const result1 = await service.releaseReservation(
        100,
        null,
        'test-token-123',
      );
      expect(result1.status).toBe('success');

      // Second release - should also succeed (idempotent)
      const result2 = await service.releaseReservation(
        100,
        null,
        'test-token-123',
      );
      expect(result2.status).toBe('success');
      expect(result2.data.restoredStock).toBe(2);
    });

    it('should reject release without authentication or guestToken', async () => {
      await expect(
        service.releaseReservation(100, null, undefined),
      ).rejects.toThrow(
        'Reservation release requires authentication or a guest session token',
      );
    });
  });

  describe('getUserReservations with guestToken', () => {
    it('should filter reservations by guestToken', async () => {
      const mockReservations = [
        {
          id: 100,
          guestToken: 'test-token-123',
          variant: { id: 1, sku: 'SKU-001', price: 100 },
        },
      ];

      (prisma.stockReservation.findMany as jest.Mock).mockResolvedValue(
        mockReservations,
      );

      const result = await service.getUserReservations(null, 'test-token-123');

      expect(result.status).toBe('success');
      expect(result.data).toHaveLength(1);
      expect(prisma.stockReservation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            guestToken: 'test-token-123',
          }),
        }),
      );
    });
  });
});
