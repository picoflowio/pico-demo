/*
 * Copyright (c) 2025 picoflow.io
 * This software is proprietary and confidential. Unauthorized copying, distribution
 * or modification of this file, via any medium, is strictly prohibited.
 */
import { ApiProperty } from '@nestjs/swagger';

export class ApiConfigDto {
  @ApiProperty({
    minLength: 1,
    description: 'file name for source file',
    example: 'hotel.pdf',
    required: true,
  })
  fileName: string;
}

export class ApiRunBodyDto {
  @ApiProperty({
    minLength: 1,
    description: 'First user message to AI',
    example: 'Hi',
    required: false,
  })
  userMessage: string;

  @ApiProperty({
    minLength: 1,
    description: 'Name of the Flow',
    example: 'HotelFlow',
    required: true,
  })
  flowName: string;

  @ApiProperty({
    minLength: 1,
    description: 'Configuration JSON',
    example: {
      fileName: '<optional additional config>',
    },
    required: false,
  })
  config: ApiConfigDto;
}

export class ApiRunResponseDto {
  @ApiProperty({
    description: 'If AI call is good',
    example: true,
    required: true,
  })
  success: boolean;

  @ApiProperty({
    description:
      'If AI call is completed, conversational will take many trips to complete',
    example: true,
    required: true,
  })
  completed: boolean;

  @ApiProperty({
    description: 'resulting AI response',
    example:
      "Hello! I can help you compare the current day temperatures of two cities. Please enter the names of two cities you'd like to compare.",
    required: true,
  })
  message: string;

  @ApiProperty({
    description: 'Session ID created for traceability',
    example: '6870216993a135e7deb762c7',
    required: true,
  })
  session: string;
}

export class ApiRunResponse400Dto {
  @ApiProperty({
    description: 'If AI call is good',
    example: false,
    required: true,
  })
  success: boolean;

  @ApiProperty({
    description:
      'If AI call is completed, conversational will take many trips to complete',
    example: true,
    required: true,
  })
  completed: boolean;

  @ApiProperty({
    description: 'resulting AI response',
    example: "FlowClass  'DemoFlow' not registered.",
    required: true,
  })
  message: string;
}

export class ApiEndResponseDto {
  @ApiProperty({
    description: 'If AI call is good',
    example: true,
    required: true,
  })
  success: boolean;

  @ApiProperty({
    description: 'Session ID created for traceability',
    example: '6870297e35bb57550b61d672',
    required: true,
  })
  session: string;
}

export class ApiEndResponse400Dto {
  @ApiProperty({
    description: 'If AI call is good',
    example: false,
    required: true,
  })
  success: boolean;

  @ApiProperty({
    description: 'resulting AI response',
    example: 'Delete session 6870297e35bb57550b61d672 failed',
    required: true,
  })
  message: string;

  session: string;
}
