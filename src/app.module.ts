import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { ProductModule } from './product/product.module';
import { CategoryModule } from './category/category.module';
import { OrderModule } from './order/order.module';
import { UserModule } from './user/user.module';
import { AddressModule } from './address/address.module';
import { AttributeModule } from './attribute/attribute.module';
import { AttributeValueModule } from './attribute-value/attribute-value.module';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { FileModule } from './common/file.module';
import { StockReservationModule } from './stock-reservation/stock-reservation.module';

@Module({
  imports: [
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'public'),
      serveRoot: '/public',
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    ProductModule,
    CategoryModule,
    OrderModule,
    UserModule,
    AddressModule,
    AttributeModule,
    AttributeValueModule,
    FileModule,
    StockReservationModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
