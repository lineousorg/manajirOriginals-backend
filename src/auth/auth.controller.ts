/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Body, Controller, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { SignUpDto } from './dto/signup.dto';
import { ApiTags, ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('signup')
  @ApiOperation({ summary: 'Register a new user', description: 'Create a new user account' })
  @ApiBody({ type: SignUpDto })
  @ApiResponse({ status: 201, description: 'User registered successfully' })
  @ApiResponse({ status: 400, description: 'Bad request - Invalid input' })
  @ApiResponse({ status: 409, description: 'Conflict - Email already exists' })
  signUp(@Body() signUpDto: SignUpDto) {
    return this.authService.signUp(signUpDto);
  }

  @Post('admin/login')
  @ApiOperation({ summary: 'Admin login', description: 'Authenticate an admin user' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        email: { type: 'string', example: 'admin@manajir.com' },
        password: { type: 'string', example: 'Admin123' },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Login successful - Returns JWT token' })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid credentials' })
  adminLogin(@Body() dto) {
    return this.authService.adminLogin(dto.email, dto.password);
  }

  @Post('login')
  @ApiOperation({ summary: 'User login', description: 'Authenticate a regular user' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        email: { type: 'string', example: 'user@example.com' },
        password: { type: 'string', example: 'User123' },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Login successful - Returns JWT token' })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid credentials' })
  login(@Body() dto) {
    return this.authService.login(dto.email, dto.password);
  }
}
