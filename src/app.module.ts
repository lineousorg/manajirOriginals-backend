import { Module } from '@nestjs/common';
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

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    ProductModule,
    CategoryModule,
    OrderModule,
    UserModule,
    AddressModule,
    AttributeModule,
    AttributeValueModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
