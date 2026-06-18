import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';

const execAsync = promisify(exec);

interface Conversation {
  id: string;
  start_time: Date;
  end_time: Date;
  state: string;
  summary: string;
  atmosphere: string;
  key_takeaways: string[];
  action_items: string[];
  raw_content: string;
}

interface PaginationInfo {
  next_cursor: string | null;
}

class BeeConversationsDownloader {
  private readonly outputDir: string;
  private readonly startDate: Date;
  private readonly endDate: Date;
  private allConversations: Conversation[] = [];

  constructor(startDate: string, endDate: string) {
    // Crear directorio para las conversaciones
    this.outputDir = path.join(process.cwd(), 'conversaciones_descargadas');

    // Rango de fechas dinamico (lo pasa quien instancia: cron o backfill manual).
    this.startDate = new Date(`${startDate}T00:00:00`);
    this.endDate = new Date(`${endDate}T23:59:59`);
  }

  async initialize() {
    try {
      await fs.mkdir(this.outputDir, { recursive: true });
      console.log(`📁 Directorio creado: ${this.outputDir}`);
    } catch (error) {
      console.error('Error creando directorio:', error);
    }
  }

  async downloadAllConversations() {
    console.log('🚀 Iniciando descarga de conversaciones...');
    console.log(`📅 Rango de fechas: ${this.startDate.toLocaleDateString()} - ${this.endDate.toLocaleDateString()}`);
    
    let hasMorePages = true;
    let cursor: string | null = null;
    let pageCount = 1;

    while (hasMorePages) {
      try {
        console.log(`\n📄 Descargando página ${pageCount}...`);
        
        // Construir comando
        let command = 'bee conversations list';
        if (cursor) {
          command += ` --cursor ${cursor}`;
        }

        // Ejecutar comando
        const { stdout, stderr } = await execAsync(command);
        
        if (stderr) {
          console.error('Error en comando:', stderr);
        }

        // Procesar la página actual
        const { conversations, nextCursor } = this.parseConversationsPage(stdout);
        
        // Filtrar conversaciones por fecha y guardar
        const filteredConversations = this.filterConversationsByDate(conversations);
        this.allConversations.push(...filteredConversations);
        
        console.log(`✅ Página ${pageCount}: ${conversations.length} conversaciones encontradas, ${filteredConversations.length} en el rango de fechas`);
        
        // Guardar página raw para referencia
        await this.saveRawPage(stdout, pageCount, cursor);
        
        // Actualizar cursor para siguiente página
        if (nextCursor) {
          cursor = nextCursor;
          pageCount++;
          // Pequeña pausa para no sobrecargar el sistema
          await this.sleep(1000);
        } else {
          hasMorePages = false;
        }

      } catch (error) {
        console.error('Error descargando conversaciones:', error);
        hasMorePages = false;
      }
    }

    console.log(`\n✨ Descarga completada. Total conversaciones en rango: ${this.allConversations.length}`);
    
    // Guardar todas las conversaciones filtradas
    await this.saveFilteredConversations();
    
    return this.allConversations;
  }

  private parseConversationsPage(rawOutput: string): { conversations: Conversation[], nextCursor: string | null } {
    const conversations: Conversation[] = [];
    const conversationBlocks = rawOutput.split('### Conversation').slice(1); // Ignorar primera parte vacía
    
    let nextCursor: string | null = null;

    // Buscar cursor en la sección de paginación
    const paginationMatch = rawOutput.match(/next_cursor:\s*(v1-\d+-\d+)/);
    if (paginationMatch) {
      nextCursor = paginationMatch[1];
    }

    for (const block of conversationBlocks) {
      try {
        const conversation = this.parseSingleConversation('### Conversation' + block);
        if (conversation) {
          conversations.push(conversation);
        }
      } catch (error) {
        console.error('Error parseando conversación:', error);
      }
    }

    return { conversations, nextCursor };
  }

  private parseSingleConversation(rawContent: string): Conversation | null {
    // Extraer ID
    const idMatch = rawContent.match(/### Conversation\s+(\d+)/);
    if (!idMatch) return null;
    
    const id = idMatch[1];

    // Extraer fechas
    const startTimeMatch = rawContent.match(/start_time:\s*(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})/);
    const endTimeMatch = rawContent.match(/end_time:\s*(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})/);
    
    if (!startTimeMatch || !endTimeMatch) return null;

    const start_time = new Date(startTimeMatch[1].replace(' ', 'T') + ':00');
    const end_time = new Date(endTimeMatch[1].replace(' ', 'T') + ':00');

    // Extraer estado
    const stateMatch = rawContent.match(/state:\s*(\w+)/);
    const state = stateMatch ? stateMatch[1] : 'UNKNOWN';

    // Extraer secciones
    const summaryMatch = rawContent.match(/## Summary\n\n([\s\S]*?)(?=\n##|$)/);
    const atmosphereMatch = rawContent.match(/## Atmosphere\n\n([\s\S]*?)(?=\n##|$)/);
    const takeawaysMatch = rawContent.match(/## Key Take aways\n\n([\s\S]*?)(?=\n##|$)/);
    const actionsMatch = rawContent.match(/## Action Items\n\n([\s\S]*?)(?=\n##|$|----|$)/);

    return {
      id,
      start_time,
      end_time,
      state,
      summary: summaryMatch ? summaryMatch[1].trim() : '',
      atmosphere: atmosphereMatch ? atmosphereMatch[1].trim() : '',
      key_takeaways: this.parseBulletList(takeawaysMatch ? takeawaysMatch[1] : ''),
      action_items: this.parseBulletList(actionsMatch ? actionsMatch[1] : ''),
      raw_content: rawContent.trim()
    };
  }

  private parseBulletList(text: string): string[] {
    if (!text) return [];
    
    return text
      .split('\n')
      .filter(line => line.trim().startsWith('-'))
      .map(line => line.replace(/^-\s*/, '').trim())
      .filter(item => item.length > 0);
  }

  private filterConversationsByDate(conversations: Conversation[]): Conversation[] {
    return conversations.filter(conv => {
      return conv.start_time >= this.startDate && conv.start_time <= this.endDate;
    });
  }

  private async saveRawPage(content: string, pageNumber: number, cursor: string | null) {
    const filename = path.join(this.outputDir, `pagina_${pageNumber}_${cursor || 'inicial'}.raw.txt`);
    await fs.writeFile(filename, content, 'utf-8');
  }

  private async saveFilteredConversations() {
    // Guardar todas las conversaciones en un archivo JSON
    const jsonPath = path.join(this.outputDir, 'conversaciones_filtradas.json');
    await fs.writeFile(jsonPath, JSON.stringify(this.allConversations, null, 2), 'utf-8');

    // Guardar resumen en formato texto legible
    const summaryPath = path.join(this.outputDir, 'resumen_conversaciones.txt');
    let summaryContent = `CONVERSACIONES DEL ${this.startDate.toLocaleDateString()} AL ${this.endDate.toLocaleDateString()}\n`;
    summaryContent += `Total: ${this.allConversations.length} conversaciones\n`;
    summaryContent += '='.repeat(80) + '\n\n';

    for (const conv of this.allConversations.sort((a, b) => a.start_time.getTime() - b.start_time.getTime())) {
      summaryContent += `📝 Conversación ${conv.id}\n`;
      summaryContent += `📅 Inicio: ${conv.start_time.toLocaleString()}\n`;
      summaryContent += `📅 Fin: ${conv.end_time.toLocaleString()}\n`;
      summaryContent += `📊 Estado: ${conv.state}\n`;
      summaryContent += `\n📋 Resumen:\n${conv.summary}\n`;
      summaryContent += `\n🎯 Puntos Clave:\n${conv.key_takeaways.map(k => `  • ${k}`).join('\n')}\n`;
      summaryContent += `\n✅ Acciones:\n${conv.action_items.map(a => `  • ${a}`).join('\n')}\n`;
      summaryContent += '\n' + '-'.repeat(60) + '\n\n';
    }

    await fs.writeFile(summaryPath, summaryContent, 'utf-8');

    console.log(`\n📊 Archivos guardados:`);
    console.log(`  • JSON: ${jsonPath}`);
    console.log(`  • Resumen: ${summaryPath}`);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async analyzeConversations() {
    console.log('\n🔍 Analizando conversaciones filtradas...');
    
    // Estadísticas básicas
    const stats = {
      total: this.allConversations.length,
      porDia: {} as Record<string, number>,
      porEstado: {} as Record<string, number>,
      duracionPromedio: 0,
      totalAcciones: 0
    };

    let totalDuracionMs = 0;

    for (const conv of this.allConversations) {
      // Por día
      const dia = conv.start_time.toISOString().split('T')[0];
      stats.porDia[dia] = (stats.porDia[dia] || 0) + 1;

      // Por estado
      stats.porEstado[conv.state] = (stats.porEstado[conv.state] || 0) + 1;

      // Duración
      const duracion = conv.end_time.getTime() - conv.start_time.getTime();
      totalDuracionMs += duracion;

      // Acciones
      stats.totalAcciones += conv.action_items.length;
    }

    stats.duracionPromedio = totalDuracionMs / this.allConversations.length / (1000 * 60); // en minutos

    // Guardar análisis
    const analysisPath = path.join(this.outputDir, 'analisis.json');
    await fs.writeFile(analysisPath, JSON.stringify(stats, null, 2), 'utf-8');

    console.log('\n📈 Estadísticas:');
    console.log(`  • Total conversaciones: ${stats.total}`);
    console.log(`  • Duración promedio: ${stats.duracionPromedio.toFixed(1)} minutos`);
    console.log(`  • Total acciones: ${stats.totalAcciones}`);
    console.log('\n  • Por día:');
    Object.entries(stats.porDia).forEach(([dia, count]) => {
      console.log(`    - ${dia}: ${count} conversaciones`);
    });
    console.log('\n  • Por estado:');
    Object.entries(stats.porEstado).forEach(([estado, count]) => {
      console.log(`    - ${estado}: ${count}`);
    });

    return stats;
  }
}

/**
 * Descarga la lista de conversaciones en un rango de fechas (YYYY-MM-DD).
 * Exportada para que el pipeline/cron la llame con una ventana movil.
 */
export async function downloadList(startDate: string, endDate: string): Promise<number> {
  const downloader = new BeeConversationsDownloader(startDate, endDate);
  await downloader.initialize();
  const conversations = await downloader.downloadAllConversations();
  if (conversations.length === 0) {
    console.log('⚠️ No se encontraron conversaciones en el rango especificado.');
    return 0;
  }
  await downloader.analyzeConversations();
  console.log('\n✅ Descarga de lista completada.');
  return conversations.length;
}

// Ejecucion directa: por defecto descarga los ultimos 3 dias.
if (require.main === module) {
  const hoy = new Date();
  const ini = new Date(hoy.getTime() - 3 * 24 * 60 * 60 * 1000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  downloadList(fmt(ini), fmt(hoy)).catch((e) => {
    console.error('❌ Error:', e instanceof Error ? e.message : e);
    process.exit(1);
  });
}