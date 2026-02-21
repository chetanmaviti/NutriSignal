import React, { useState } from 'react';
import { View, Button, Image, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import axios from 'axios';
import { launchCamera, launchImageLibrary } from 'react-native-image-picker';
import { useAuth } from '../context/AuthContext';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function ScanScreen() {
  const [photo, setPhoto] = useState<any>(null);
  const [result, setResult] = useState<any>(null);
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [classifying, setClassifying] = useState(false);
  const { recordScan } = useAuth();

  const resetScanState = () => {
    setPhoto(null);
    setResult(null);
    setExpanded(false);
  };

  const takePhoto = async () => {
    const res = await launchCamera({ mediaType: 'photo', quality: 0.8 });
    if (res.assets && res.assets[0]) {
      setPhoto(res.assets[0]);
      setResult(null);
      setExpanded(false);
    }
  };

  const chooseFromLibrary = async () => {
    const res = await launchImageLibrary({ mediaType: 'photo', quality: 0.8 });
    if (res.assets && res.assets[0]) {
      setPhoto(res.assets[0]);
      setResult(null);
      setExpanded(false);
    }
  };

  const classifyPhoto = async () => {
    if (!photo) return;

    const formData = new FormData();
    formData.append('file', { uri: photo.uri, name: 'photo.jpg', type: 'image/jpeg' });

    try {
      setClassifying(true);
      const response = await axios.post('http://127.0.0.1:8000/classify', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setResult(response.data);
      setExpanded(false);
    } catch (err) {
      setResult({ error: 'Could not connect to backend.' });
    } finally {
      setClassifying(false);
    }
  };

  const saveScanResult = async () => {
    if (!result || result.error) {
      Alert.alert('Error', 'Cannot save invalid result');
      return;
    }

    try {
      setSaving(true);
      await recordScan(result.label, result.signal, result.score, result.nutrition, {
        scoring_system: result.scoring_system,
        scoring_version: result.scoring_version,
        fallback_used: result.fallback_used,
        foodcompass_food_code: result.foodcompass_food_code,
        foodcompass_missing_domains: result.foodcompass_missing_domains,
        foodcompass_missing_reason: result.foodcompass_missing_reason,
        scoring_metadata: result.scoring_metadata,
      });
      Alert.alert('Success', 'Scan saved to your history!');
    } catch (err) {
      Alert.alert('Error', 'Failed to save scan');
    } finally {
      setSaving(false);
    }
  };

  const renderNutrient = (label: string, value: any, unit: string) => (
    <View style={styles.nutrientRow} key={label}>
      <Text style={styles.nutrientLabel}>{label}</Text>
      <Text style={styles.nutrientValue}>
        {value !== undefined && value !== null ? `${typeof value === 'number' ? value.toFixed(2) : value} ${unit}` : '-'}
      </Text>
    </View>
  );

  const scoringSystemLabel = result?.scoring_system || 'USDA API';
  const scoringVersionLabel = scoringSystemLabel === 'Food Compass' ? (result?.scoring_version || '2.0') : null;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView contentContainerStyle={[styles.container, photo && { paddingTop: 12, paddingBottom: 15, justifyContent: 'flex-start' }]}>
        {result ? (
          <TouchableOpacity
            style={styles.backButton}
            onPress={resetScanState}
            disabled={saving}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={styles.backButtonText}>← Back</Text>
          </TouchableOpacity>
        ) : null}

        {!photo ? <Text style={styles.title}>NutriSignal</Text> : null}
      
        {!result ? (
          <View style={styles.buttonContainer}>
            <Button title="📸 Take Photo" onPress={takePhoto} disabled={saving} />
            <View style={{ height: photo ? 5 : 10 }} />
            <Button title="🖼️ Choose from Gallery" onPress={chooseFromLibrary} disabled={saving} />
          </View>
        ) : null}

        {photo && <Image source={{ uri: photo.uri }} style={styles.image} />}
      
        {!result ? (
          <View style={{ marginVertical: photo ? 10 : 20 }}>
            <Button title="Classify" onPress={classifyPhoto} disabled={saving || classifying || !photo} />
            {classifying ? (
              <View style={styles.classifyingContainer}>
                <ActivityIndicator size="large" color="#007AFF" />
                <Text style={styles.classifyingText}>Processing...</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {result && (
          <View style={styles.resultContainer}>
            {result.error ? (
              <Text style={styles.errorText}>{result.error}</Text>
            ) : (
              <View>
                <View style={styles.resultContent}>
                  <View style={styles.circleColumn}>
                    <Text style={styles.bigCircle}>
                      {result.signal === "Green" ? "🟢" : result.signal === "Yellow" ? "🟡" : "🔴"}
                    </Text>
                  </View>
                  <View style={styles.infoColumn}>
                    <Text style={styles.label}>{result.label}</Text>
                    <Text style={styles.score}>{result.score?.toFixed(1) ?? 0} / 100</Text>
                  </View>
                </View>

                <TouchableOpacity style={[styles.saveButton, saving && styles.saveButtonDisabled]} onPress={saveScanResult} disabled={saving}>
                  {saving ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.saveButtonText}>💾 Save Scan</Text>
                  )}
                </TouchableOpacity>

                {result.nutrition && (
                  <View style={styles.nutrientContainer}>
                    <TouchableOpacity style={styles.accordionHeader} onPress={() => setExpanded(!expanded)} activeOpacity={0.7}>
                      <Text style={styles.nutrientHeader}>Nutrition Facts (per 100g)</Text>
                      <Text style={styles.arrow}>{expanded ? "▲" : "▼"}</Text>
                    </TouchableOpacity>

                    {expanded && (
                      <View style={{ marginTop: 5 }}>
                        {renderNutrient("Calories", result.nutrition.calories, "kcal")}
                        {renderNutrient("Protein", result.nutrition.protein, "g")}
                        {renderNutrient("Carbs", result.nutrition.carbohydrates, "g")} 
                        {renderNutrient("Total Fat", result.nutrition.fat, "g")}
                        {renderNutrient("Sat. Fat", result.nutrition.saturated_fat, "g")}
                        {renderNutrient("Sugars", result.nutrition.sugar, "g")}
                        {renderNutrient("Fiber", result.nutrition.fiber, "g")}
                        {renderNutrient("Sodium", result.nutrition.sodium, "mg")}
                      </View>
                    )}

                    <View style={styles.modelMetaBlock}>
                      <Text style={styles.modelMetaTitle}>Model used: {scoringSystemLabel}</Text>
                      {scoringVersionLabel ? <Text style={styles.modelMetaText}>Version: {scoringVersionLabel}</Text> : null}
                    </View>
                  </View>
                )}

                {!result.nutrition && (
                  <View style={styles.modelMetaOnlyBlock}>
                    <Text style={styles.modelMetaTitle}>Model used: {scoringSystemLabel}</Text>
                    {scoringVersionLabel ? <Text style={styles.modelMetaText}>Version: {scoringVersionLabel}</Text> : null}
                  </View>
                )}
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#fff',
  },
  container: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 26,
    fontWeight: '600',
    marginBottom: 20,
  },
  buttonContainer: {
    width: '80%',
  },
  backButton: {
    alignSelf: 'flex-start',
    marginLeft: 14,
    marginTop: -4,
    marginBottom: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  backButtonText: {
    fontSize: 18,
    color: '#007AFF',
    fontWeight: '600',
  },
  image: {
    width: '88%',
    height: 360,
    marginVertical: 10,
    borderRadius: 15,
    resizeMode: 'cover',
  },
  resultContainer: {
    marginTop: 0,
    paddingHorizontal: 20,
    width: '100%',
  },
  resultContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f5f5f5',
    borderRadius: 15,
    padding: 15,
    marginBottom: 10,
  },
  circleColumn: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  bigCircle: {
    fontSize: 80,
  },
  infoColumn: {
    flex: 1,
    marginLeft: 12,
  },
  label: {
    fontSize: 22,
    fontWeight: '600',
    marginBottom: 8,
    textTransform: 'capitalize',
  },
  score: {
    fontSize: 18,
    fontWeight: '500',
    color: '#666',
  },
  errorText: {
    fontSize: 16,
    color: '#d32f2f',
    textAlign: 'center',
  },
  nutrientContainer: {
    backgroundColor: '#f9f9f9',
    borderRadius: 15,
    padding: 15,
    borderWidth: 1,
    borderColor: '#eee',
  },
  accordionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  nutrientHeader: {
    fontSize: 16,
    fontWeight: '700',
    color: '#333',
  },
  arrow: {
    fontSize: 18,
    color: '#666',
  },
  nutrientRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  nutrientLabel: {
    fontSize: 14,
    color: '#555',
  },
  nutrientValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
  },
  saveButton: {
    backgroundColor: '#34C759',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 15,
    marginHorizontal: 20,
    marginBottom: 20,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  classifyingContainer: {
    marginTop: 24,
    minHeight: 140,
    alignItems: 'center',
    justifyContent: 'center',
  },
  classifyingText: {
    marginTop: 8,
    color: '#666',
    fontSize: 14,
  },
  modelMetaBlock: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#ececec',
  },
  modelMetaOnlyBlock: {
    marginHorizontal: 20,
    marginBottom: 12,
    backgroundColor: '#f9f9f9',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#eee',
    padding: 12,
  },
  modelMetaTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#222',
  },
  modelMetaText: {
    marginTop: 4,
    fontSize: 13,
    color: '#555',
  },
});
